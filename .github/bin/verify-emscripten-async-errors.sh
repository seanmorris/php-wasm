#!/usr/bin/env bash

set -euo pipefail

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
cd "${WORK_DIR}"

cat > async-side.c <<'EOF'
extern int suspending_callback(int value);

int side_call(int value) {
	volatile int saved = value;
	int first = suspending_callback(saved);
	return suspending_callback(first + 1) + 1;
}
EOF

emcc async-side.c -O2 -sSIDE_MODULE=1 -sASYNCIFY=1 '-sASYNCIFY_IMPORTS=*' -o async-side.so

cat > async-errors.c <<'EOF'
#include <emscripten.h>
#include <stdlib.h>

extern int side_call(int value);

EM_ASYNC_JS(int, callback_wait, (int value), {
	await Promise.resolve();
	return value;
});

EMSCRIPTEN_KEEPALIVE int suspending_callback(int value) {
	return callback_wait(value);
}

EM_ASYNC_JS(int, rejected_import, (), {
	await Promise.resolve();
	throw Module['failure'];
});

EM_JS(int, failed_rewind, (), {
	if (Module['resumeStarted']) {
		Module['rewinds']++;
		throw Module['failure'];
	}
	Module['resumeStarted'] = true;
	Module['rewinds'] = 0;
	return Asyncify.handleSleep(wakeUp => {
		Module['lateWakeUp'] = () => wakeUp(7);
		queueMicrotask(Module['lateWakeUp']);
	});
});

EM_JS(int, throwing_import, (), {
	return Asyncify.handleAsync(() => { throw Module['failure']; });
});

EM_JS(int, failed_unwind, (), {
	Asyncify.handleAsync(async () => {
		await Promise.resolve();
		throw Module['failure'];
	});
	throw new WebAssembly.RuntimeError('initial unwind failed');
});

EMSCRIPTEN_KEEPALIVE int probe(int mode) {
	if (mode == 0) return 42;
	if (mode == 2) return rejected_import();
	if (mode == 3) return failed_rewind();
	if (mode == 6) return throwing_import();
	if (mode == 8) return failed_unwind();
	if (mode == 9) return side_call(40);
	emscripten_sleep(1);
	if (mode == 4) __builtin_trap();
	if (mode == 5) emscripten_sleep(1);
	if (mode == 7) exit(0);
	return 42;
}
EOF

cat > async-errors.test.mjs <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import createRuntime from './async-errors.mjs';

const call = (runtime, mode) => runtime.ccall('probe', 'number', ['number'], [mode], {async: true});

// Timeouts are test guards: a lost rejection must fail instead of stalling CI.
test('successful calls can sleep repeatedly and reuse the runtime', {timeout: 2000}, async () => {
	const runtime = await createRuntime();
	assert.equal(runtime.ccall('probe', 'number', ['number'], [0]), 42);
	for (const mode of [1, 5, 1]) assert.equal(await call(runtime, mode), 42);
});

test('side module frames survive repeated calls into a suspending main-module import', {timeout: 2000}, async () => {
	const runtime = await createRuntime();
	assert.equal(await call(runtime, 9), 42);
	assert.equal(await call(runtime, 9), 42);
});

for (const mode of [2, 3, 6]) {
	for (const failure of [new Error('native import failed'), undefined, null, 'import failure']) {
		test(`mode ${mode} rejects with ${String(failure)} and disables the failed instance`, {timeout: 2000}, async () => {
			const runtime = await createRuntime({failure});
			await assert.rejects(call(runtime, mode), error => error === failure);
			assert.throws(() => runtime._probe(0), error => error === failure);
			if (mode === 3) {
				runtime.lateWakeUp();
				assert.equal(runtime.rewinds, 1);
			}
			assert.equal(await call(await createRuntime(), 1), 42);
		});
	}
}

test('a native trap after resuming rejects with the original RuntimeError', {timeout: 2000}, async () => {
	const runtime = await createRuntime();
	let failure;
	await assert.rejects(call(runtime, 4), error => {
		failure = error;
		return error instanceof WebAssembly.RuntimeError;
	});
	assert.throws(() => runtime._probe(0), error => error === failure);
});

test('normal native exit still settles successfully', {timeout: 2000}, async () => {
	const runtime = await createRuntime();
	await call(runtime, 7);
	assert.equal(process.exitCode ?? 0, 0);
});

test('a failed initial unwind cannot resume or reject again later', {timeout: 2000}, async () => {
	const runtime = await createRuntime({failure: new Error('late rejection')});
	let failure;
	assert.throws(() => call(runtime, 8), error => {
		failure = error;
		return error instanceof WebAssembly.RuntimeError && error.message === 'initial unwind failed';
	});
	await new Promise(resolve => setTimeout(resolve, 10));
	assert.throws(() => runtime._probe(0), error => error === failure);
});

test('handled native errors do not change the host process exit code', () => {
	assert.equal(process.exitCode ?? 0, 0);
});
EOF

for assertions in 0 1; do
	emcc async-errors.c async-side.so \
		-O2 \
		-sASYNCIFY=1 \
		-sASYNCIFY_IMPORTS=failed_rewind,throwing_import,failed_unwind,side_call \
		-sMAIN_MODULE=1 \
		-sMODULARIZE=1 \
		-sEXPORT_ES6=1 \
		-sENVIRONMENT=node \
		-sEXIT_RUNTIME=1 \
		-sASSERTIONS="${assertions}" \
		-sEXPORTED_RUNTIME_METHODS=ccall \
		-o async-errors.mjs
	node --test async-errors.test.mjs
done

# MAIN_MODULE callback wrappers must survive Binaryen's late dynCall exports.
# SDL keyboard/mouse events use the same makeDynCall path in library_html5.
cat > callback.c <<'EOF'
#include <emscripten.h>
extern int invoke_callback(int (*callback)(int, int, int), int, int, int);
static int answer(int a, int b, int c) { return a + b + c; }
EMSCRIPTEN_KEEPALIVE int probe_callback(void) { return invoke_callback(answer, 10, 20, 12); }
EOF

cat > callback.js <<'EOF'
addToLibrary({
  invoke_callback__deps: ['$dynCall'],
  invoke_callback: (callback, a, b, c) => {{{ makeDynCall('iiii', 'callback') }}}(a, b, c)
});
EOF

for assertions in 0 1; do
	emcc callback.c --js-library callback.js -O2 \
		-sMAIN_MODULE=1 -sASYNCIFY=1 -sWASM_BIGINT=1 \
		-sASSERTIONS="${assertions}" -sMODULARIZE=1 -sENVIRONMENT=node \
		-o callback.mjs
	node --input-type=module -e '
		import assert from "node:assert/strict";
		import createRuntime from "./callback.mjs";
		const runtime = await createRuntime();
		assert.equal(runtime._probe_callback(), 42);
	'
done

echo 'Emscripten async error propagation checks passed'
