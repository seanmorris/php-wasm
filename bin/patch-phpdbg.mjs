#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const block = (name, text) => `/* phpdbg_wasm_bridge:${name} */\n${text}\n/* /phpdbg_wasm_bridge:${name} */`;
function insert(source, name, anchor, text) {
	const pattern = new RegExp(`/\\* phpdbg_wasm_bridge:${name} \\*/[\\s\\S]*?/\\* /phpdbg_wasm_bridge:${name} \\*/`);
	if(pattern.test(source)) return source.replace(pattern, () => block(name, text));
	if(!source.includes(anchor)) throw new Error(`Unsupported phpdbg source layout: ${name}`);
	return source.replace(anchor, anchor + '\n' + block(name, text));
}

export function instrumentSource(name, source) {
	const include = name === 'phpdbg.c'
		? '#define PHPDBG_WASM_BRIDGE_IMPL\n#include "phpdbg_wasm_bridge.h"\n#undef PHPDBG_WASM_BRIDGE_IMPL'
		: '#include "phpdbg_wasm_bridge.h"';
	// Include after the phpdbg headers, where PHPDBG_G is defined.
	const anchor = name === 'phpdbg_out.c' ? '#include "phpdbg_io.h"' : '#include "phpdbg.h"';
	source = insert(source, 'include', anchor, include);
	if(name === 'phpdbg_out.c') {
		source = insert(source, 'output', source.match(/(?:static )?int phpdbg_process_print\([^\n]+\) \{/)?.[0] ?? '__missing_output_signature__',
			'\tif (msg && msglen > 0) phpdbg_wasm_output(type == P_STDOUT ? 1 : type == P_STDERR ? 2 : type == P_ERROR ? 3 : 0, fd, msg, msglen, !!(PHPDBG_G(flags) & PHPDBG_IN_EVAL));');
	}
	if(name === 'phpdbg_prompt.c') {
		source = insert(source, 'checkpoint', '\t\tphpdbg_wasm_current_line = zend_get_executed_lineno();',
			'\t\tstatic unsigned int wasm_ticks = 0;\n\t\tif ((++wasm_ticks & 1023) == 0 && !(PHPDBG_G(flags) & PHPDBG_IN_EVAL)) {\n\t\t\tint action = phpdbg_wasm_checkpoint();\n\t\t\tif (action == 1) PHPDBG_G(flags) |= PHPDBG_IS_SIGNALED;\n\t\t\tif (action == 2) { PHPDBG_G(flags) |= PHPDBG_IS_QUITTING; zend_bailout(); }\n\t\t}');
		// Capture exception data before phpdbg releases the Zend strings.
		const exceptionAnchor = '\t\t\tzend_string_release(msg);';
		const exception = '\t\t\tphpdbg_wasm_event("exception", ZSTR_VAL(exception->ce->name), ZSTR_VAL(msg), ZSTR_VAL(file), line, 255);';
		const marker = '/* phpdbg_wasm_bridge:exception */';
		if(source.includes(marker)) {
			source = source.replace(/\/\* phpdbg_wasm_bridge:exception \*\/[\s\S]*?\/\* \/phpdbg_wasm_bridge:exception \*\//, () => block('exception', exception));
		} else {
			if(!source.includes(exceptionAnchor)) throw new Error('Unsupported phpdbg exception layout');
			source = source.replace(exceptionAnchor, block('exception', exception) + '\n' + exceptionAnchor);
		}
	}
	return source;
}

export async function patchPhpDbg(root) {
	const directory = path.join(root, 'sapi/phpdbg');
	const header = await fs.readFile(new URL('../source/phpdbg_wasm_bridge.h', import.meta.url));
	const updates = await Promise.all(['phpdbg.c','phpdbg_prompt.c','phpdbg_out.c'].map(async name => {
		const filename = path.join(directory, name);
		const source = await fs.readFile(filename, 'utf8');
		return {filename, source, patched: instrumentSource(name, source)};
	}));
	for(const {filename, source, patched} of updates) if(source !== patched) await fs.writeFile(filename, patched);
	const target = path.join(directory, 'phpdbg_wasm_bridge.h');
	if(!header.equals(await fs.readFile(target).catch(() => Buffer.alloc(0)))) await fs.writeFile(target, header);
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await patchPhpDbg(process.argv[2]);
