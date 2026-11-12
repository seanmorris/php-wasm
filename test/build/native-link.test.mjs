import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import makeEnvironment from '../../bin/make-environment.cjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('standalone CGI, CLI and debugger builds prepare pre-JS before their native link', t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-sapi-pre-js-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const files = ['Makefile', 'php.mk', 'source/env.js', 'packages/intl/pre.mak', 'packages/intl/static.mak', 'packages/intl/env.js'];
	for(const sapi of ['cgi', 'cli', 'dbg'])
		files.push(`packages/php-${sapi}-wasm/pre.mak`, `packages/php-${sapi}-wasm/static.mak`);
	for(const file of files)
	{
		fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive: true});
		fs.copyFileSync(path.join(root, file), path.join(directory, file));
	}
	// Run the real pre-JS concatenation recipe without Docker. Native linking is
	// replaced with a consumer that requires the generated input to exist first.
	fs.writeFileSync(path.join(directory, 'docker-run.cjs'), `
const fs = require('node:fs');
if(process.argv[2] !== 'cat') throw Error('Unexpected builder command');
for(const file of process.argv.slice(3)) process.stdout.write(fs.readFileSync(file.replace(/^\\/src\\//, '')));
`);
	const targets = ['cgi', 'cli', 'dbg'].flatMap(sapi => ['mjs', 'js'].map(format => `packages/php-${sapi}-wasm/php8.4-${sapi}-node.${format}`));
	fs.writeFileSync(path.join(directory, 'native-fixture.mak'), `
${targets.join(' ')}:
	@test -f \${PRE_JS_CACHE} || { echo 'Native link started before pre-JS was generated' >&2; exit 1; }
	@cat \${PRE_JS_CACHE} > $@
`);
	const expected = fs.readFileSync(path.join(directory, 'source/env.js'), 'utf8')
		+ fs.readFileSync(path.join(directory, 'packages/intl/env.js'), 'utf8');
	for(const target of targets)
	{
		fs.rmSync(path.join(directory, '.cache'), {recursive: true, force: true});
		fs.mkdirSync(path.join(directory, '.cache'));
		execFileSync('make', [
			'--no-print-directory', '-f', 'Makefile', '-f', 'native-fixture.mak'
			, '--old-file=third_party/php8.4-src/configured'
			, '--old-file=third_party/php8.4-src/phpdbg-bridge'
			, '--old-file=bin/dbg-assets.mjs'
			, 'ENV_FILE=/dev/null'
			, 'PHP_VERSION=8.4'
			, 'WITH_INTL=static'
			, 'EXTENSION_PACKAGE_DIRS=packages/intl'
			, 'PHP_LINK_DEPS='
			, 'PHP_CONFIGURE_DEPS='
			, 'ARCHIVES='
			, 'PRELOAD_ASSETS='
			, 'BUILD_WORKSPACE='
			, 'MAKE_SHUFFLE='
			, 'DOCKER_RUN=node docker-run.cjs'
			, target
		], {cwd: directory, env: makeEnvironment.independentMakeEnvironment(), stdio: 'pipe'});
		assert.equal(fs.readFileSync(path.join(directory, target), 'utf8'), expected, target);
	}
});

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
