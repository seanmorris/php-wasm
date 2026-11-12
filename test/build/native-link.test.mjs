import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import makeEnvironment from '../../bin/make-environment.cjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('WebView compiler flags include the web environment required for asynchronous asset loading', () => {
	for(const environment of ['web', 'worker', 'webview', 'node'])
	{
		const flags = execFileSync('make', [
			'--no-print-directory', '-f', 'Makefile', '-f', '-', 'environment-flags'
			, 'ENV_FILE=/dev/null', 'MAKE_SHUFFLE=', 'BUILD_WORKSPACE='
			, 'EXTENSION_PACKAGE_DIRS=', 'FS_TYPE='
			, `ENVIRONMENT=${environment}`
		], {
			cwd: root
			, env: makeEnvironment.independentMakeEnvironment()
			, encoding: 'utf8'
			, input: 'environment-flags:\n\t@echo $(BUILD_FLAGS)\n'
		});
		const expected = environment === 'webview' ? 'web,webview' : environment;
		assert.ok(flags.includes(`-s ENVIRONMENT=${expected} `), flags);
	}
});

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

test('build targets never start a sub-make without goals', t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-submake-goals-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const log = path.join(directory, 'calls');
	const recorder = path.join(directory, 'record-make.cjs');
	// Stand in for $(MAKE) in the production recipes: record each sub-make's
	// arguments instead of running it. A sub-make with no goal would build the
	// default goal, which leads back to these same recipes.
	fs.writeFileSync(recorder, `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`);
	const subMakes = (target, ...variables) => {
		fs.writeFileSync(log, '');
		execFileSync('make', [
			'--no-print-directory', '-f', 'Makefile'
			, 'ENV_FILE=/dev/null'
			, 'PHP_VERSION=8.4'
			, 'BUILD_WORKSPACE='
			, 'MAKE_SHUFFLE='
			, `MAKE=node '${recorder}'`
			, ...variables
			, target
		], {cwd: root, env: makeEnvironment.independentMakeEnvironment(), stdio: 'pipe'});
		return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
	};
	const goals = call => call.filter(argument => !argument.startsWith('-'));
	// No extension packages and no preload data leave PHP_CONFIGURE_DEPS, the
	// CommonJS asset lists and the library lists empty.
	const bare = ['EXTENSION_PACKAGE_DIRS=', 'PRELOAD_ASSETS='];
	const runtimeTargets = ['', '-cgi', '-cli', '-dbg'].flatMap(
		sapi => ['web', 'worker', 'webview', 'node'].flatMap(
			runtime => ['mjs', 'js'].map(format => `${runtime}${sapi}-${format}`)
		)
	);
	for(const target of runtimeTargets)
	{
		const calls = subMakes(target, ...bare);
		assert.ok(calls.length > 0, `${target} built nothing`);
		for(const call of calls) assert.notDeepEqual(goals(call), [], `${target} started a sub-make without goals: make ${call.join(' ')}`);
	}
	for(const target of ['archives', 'shared', 'dynamic', 'deps'])
		assert.deepEqual(subMakes(target, ...bare), [], `${target} started a sub-make with nothing to build`);
	// A list with entries still reaches its sub-make.
	for(const [target, variable] of [['archives', 'ARCHIVES'], ['shared', 'SHARED_LIBS'], ['dynamic', 'DYNAMIC_LIBS'], ['deps', 'PHP_CONFIGURE_DEPS']])
		assert.deepEqual(subMakes(target, ...bare, `${variable}=requested-goal`).map(goals), [['requested-goal']], target);
	assert.deepEqual(goals(subMakes('node-dbg-js', ...bare, 'PHP_CONFIGURE_DEPS=requested-goal')[0]), ['requested-goal']);
	assert.deepEqual(goals(subMakes('web-js', ...bare, 'EXTRA_MODULES=requested-goal').at(-1)), ['requested-goal']);
});
