import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

test('Web ESM postprocessing preserves native exports beside assertion getters', async t => {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'php-wasm-web-exports-'));
	t.after(() => fs.rm(temporary, {recursive: true, force: true}));
	const makefile = await fs.readFile(new URL('../../Makefile', import.meta.url), 'utf8');
	const start = makefile.indexOf('${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs: ${DEPENDENCIES}');
	assert.notEqual(start, -1);
	const recipe = makefile.slice(start, makefile.indexOf('\n\n', start));
	const postprocess = recipe.split('\n').filter(line => line.startsWith('\tperl '));
	assert.ok(postprocess.length > 0);
	const output = path.join(temporary, 'runtime.mjs');
	// Emscripten's debug getter and native C export intentionally have different names.
	await fs.writeFile(output, `
const Module = {};
Object.defineProperty(Module, 'setTempRet0', {get() {throw new Error('unexported runtime method');}});
const _setTempRet0 = Module['_setTempRet0'] = value => value;
export default Module;
`);
	const fixture = path.join(temporary, 'Makefile');
	await fs.writeFile(fixture, `.PHONY: ${output}\n${output}:\n${postprocess.join('\n')}\n`);
	await run('make', ['--no-print-directory', '-f', fixture, output], {cwd: temporary});
	const {default: module} = await import(pathToFileURL(output));
	assert.equal(module._setTempRet0(42), 42);
	assert.throws(() => module.setTempRet0, /unexported runtime method/);
});
