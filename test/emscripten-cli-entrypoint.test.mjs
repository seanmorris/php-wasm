import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const cliWrappers = ['source/PhpCliNode.mjs', 'source/PhpCliWeb.mjs'];
const phpdbgWrappers = ['source/PhpDbgNode.mjs', 'source/PhpDbgWeb.mjs'];
const phpVersions = ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];

test('CLI wrappers call the explicit Emscripten entrypoint with terminated argv', () => {
	for(const wrapper of cliWrappers)
	{
		const contents = fs.readFileSync(path.join(repoRoot, wrapper), 'utf8');

		assert.match(contents, /_malloc\(4 \* \(ptrs\.length \+ 1\)\)/, wrapper);
		assert.match(contents, /setValue\([^\n]+4 \* ptrs\.length, 0, '\*'\)/, wrapper);
		assert.match(contents, /'wasm_sapi_cli_main'/, wrapper);
		assert.doesNotMatch(contents, /ccall\(\s*'main'/, wrapper);
	}
});

test('phpdbg wrappers call the explicit Emscripten entrypoint with terminated argv', () => {
	for(const wrapper of phpdbgWrappers)
	{
		const contents = fs.readFileSync(path.join(repoRoot, wrapper), 'utf8');

		assert.match(contents, /_malloc\(4 \* \(ptrs\.length \+ 1\)\)/, wrapper);
		assert.match(contents, /setValue\([^\n]+4 \* ptrs\.length, 0, '\*'\)/, wrapper);
		assert.match(contents, /'wasm_sapi_phpdbg_main'/, wrapper);
		assert.doesNotMatch(contents, /ccall\(\s*'main'/, wrapper);
	}
});

test('all supported PHP patches export explicit CLI and phpdbg entrypoints', () => {
	for(const version of phpVersions)
	{
		const patchFile = `patch/php${version}.patch`;
		const contents = fs.readFileSync(path.join(repoRoot, patchFile), 'utf8');

		assert.match(contents, /\+#include <emscripten\.h>/, patchFile);
		assert.match(
			contents
			, /\+#ifdef __EMSCRIPTEN__\n\+\treturn exit_status;\n\+#else\n-\texit\(exit_status\);\n\+\texit\(exit_status\);\n\+#endif/
			, patchFile
		);
		assert.match(
			contents
			, /\+int EMSCRIPTEN_KEEPALIVE wasm_sapi_cli_main\(int argc, char \*\*argv\)\n\+\{\n\+\treturn main\(argc, argv\);\n\+\}/
			, patchFile
		);
		assert.match(
			contents
			, /-int main\(int argc, char \*\*argv\) \/\* \{\{\{ \*\/\n\+int EMSCRIPTEN_KEEPALIVE wasm_sapi_phpdbg_main\(int argc, char \*\*argv\) \/\* \{\{\{ \*\//
			, patchFile
		);
	}
});
