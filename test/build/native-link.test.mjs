import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('the real build preserves static curl helpers through libtool and passes native link dependencies', t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-link-flags-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const output = path.join(directory, 'flags');
	for(const mode of ['static', 'dynamic', '0'])
	{
		execFileSync('make', ['--no-print-directory', '-f', 'Makefile', '-f', '-', 'flags', 'ENV_FILE=/dev/null', 'MAKE_SHUFFLE=', 'BUILD_WORKSPACE=', 'EXTENSION_PACKAGE_DIRS=packages/curl', `WITH_CURL=${mode}`], {
			cwd: root
			, stdio: 'pipe'
			, input: `flags:\n\t$(file >${output},$(BUILD_FLAGS))\n`
		});
		const flags = fs.readFileSync(output, 'utf8');
		if(mode === 'static')
		{
			assert.match(flags, /-Wl,--whole-archive,\/src\/lib\/lib\/libcurl\.a,--no-whole-archive/);
			assert.match(flags, /PHP_WASM_LINK_DEPS='[^']*\/src\/lib\/lib\/libcurl\.a/);
		}
		else assert.doesNotMatch(flags, /libcurl\.a|--whole-archive/);
	}
});

test('native PHP relinks each SAPI after a static archive changes', t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-native-link-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const archive = path.join(directory, 'libcurl.a');
	const targets = ['php-cli', 'php-cgi', 'php-dbg'];
	fs.writeFileSync(archive, 'old curl');
	fs.writeFileSync(path.join(directory, 'Makefile'), `
SAPI_CLI_PATH=php-cli
SAPI_CGI_PATH=php-cgi
SAPI_PHPDBG_PATH=php-dbg
$(SAPI_CLI_PATH) $(SAPI_CGI_PATH) $(SAPI_PHPDBG_PATH):
	@cat libcurl.a > $@
`);
	const build = () => execFileSync('make', ['--no-print-directory', '-f', path.join(root, 'php.mk'), `PHP_WASM_LINK_DEPS=${archive}`, ...targets], {cwd: directory});
	build();
	const before = targets.map(name => fs.statSync(path.join(directory, name)).mtimeMs);
	build();
	assert.deepEqual(targets.map(name => fs.statSync(path.join(directory, name)).mtimeMs), before);
	for(const name of targets) fs.utimesSync(path.join(directory, name), 1, 1);
	fs.writeFileSync(archive, 'new curl with Digest');
	build();
	for(const name of targets) assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), 'new curl with Digest');
});
