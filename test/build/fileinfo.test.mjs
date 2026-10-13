import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const versions = ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];
const make = (args, input = '') => execFileSync('make', ['--no-print-directory', ...args], {
	cwd: root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
});

test('fileinfo modes select native configuration, modules, and eligible stream tests', () => {
	for(const [setting, mode] of [['', 'dynamic'], ['1', 'dynamic'], ['dynamic', 'dynamic'], ['static', 'static'], ['0', '0']])
	{
		for(const vrzno of [0, 1])
		{
			const result = JSON.parse(make(['-f', '-', 'check'], `
PHP_VERSION=8.4
WITH_FILEINFO${setting ? '=' + setting : '?=dynamic'}
WITH_VRZNO=${vrzno}
include packages/fileinfo/static.mak
check:
	@printf '%s\\n' '{"mode":"$(WITH_FILEINFO)","modules":"$(EXTRA_MODULES)","configure":"$(CONFIGURE_FLAGS)","tests":"$(TEST_LIST)"}'
`));
			assert.equal(result.mode, mode);
			assert.equal(result.modules.trim(), mode === 'dynamic' ? 'packages/fileinfo/php8.4-fileinfo.so' : '');
			assert.equal(result.configure.trim(), mode === 'static' ? '--enable-fileinfo' : '');
			assert.equal(result.tests.includes('basic.mjs'), mode !== '0');
			assert.equal(result.tests.includes('async-stream.mjs'), mode !== '0' && vrzno === 1);
		}
	}
});

test('every Make test runner receives the resolved fileinfo mode', () => {
	const targets = ['test-node', 'test-bun', 'test-node-standard', 'test-bun-standard'
		, 'test-node-cjs', 'test-bun-cjs', 'test-node-cjs-standard', 'test-bun-cjs-standard'
		, 'test-deno', 'test-cgi-node', 'test-cgi-bun'
		, 'test-cgi-node-cjs', 'test-cgi-bun-cjs'
	];
	const built = ['node-mjs', 'node-cgi-mjs', 'node-cli-mjs', 'node-dbg-mjs'
		, 'node-js', 'node-cgi-js', 'node-cli-js', 'node-dbg-js'
	].flatMap(target => ['-o', target]);
	for(const mode of ['dynamic', 'static', '0'])
	{
		for(const target of targets)
		{
			const recipe = make(['-n', ...built, target, 'ENV_FILE=/dev/null', 'MAKE_SHUFFLE='
				, 'BUILD_WORKSPACE=', 'EXTENSION_PACKAGE_DIRS=packages/fileinfo', `WITH_FILEINFO=${mode}`
			]);
			assert.match(recipe, new RegExp(`WITH_FILEINFO=${mode}\\s`), target);
		}
	}
});

test('fileinfo uses the shared Asyncify link flags and configure environment', () => {
	const recipe = make(['-Bn', 'packages/fileinfo/php8.4-fileinfo.so'
		, '-o', 'third_party/php8.4-src/scripts/phpize'
		, '-o', 'third_party/php8.4-fileinfo/config.m4'
		, 'ENV_FILE=/dev/null', 'MAKE_SHUFFLE=', 'BUILD_WORKSPACE='
		, 'EXTENSION_PACKAGE_DIRS=packages/fileinfo', 'PHP_VERSION=8.4'
	]);
	const link = recipe.split('\n').find(line => /emcc -shared/.test(line));
	assert.ok(link, recipe);
	for(const flag of ['-sSIDE_MODULE=1', '-sASYNCIFY=1', '-sASYNCIFY_IMPORTS=*'])
	{
		assert.ok(link.includes(flag), flag);
	}
	assert.match(recipe, /emconfigure .*LDFLAGS='-sASYNCIFY=1'/);
});

test('the packed fileinfo entrypoint imports all supported version loaders', async t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fileinfo-package-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const [packed] = JSON.parse(execFileSync('npm', [
		'pack', './packages/fileinfo', '--json', '--ignore-scripts', '--pack-destination', directory
	], {cwd: root, encoding: 'utf8'}));
	execFileSync('tar', ['-xzf', path.join(directory, packed.filename), '-C', directory]);
	const entry = path.join(directory, 'package/index.mjs');
	const fileinfo = await import(pathToFileURL(entry));
	for(const version of versions)
	{
		const [lib] = fileinfo.default.getLibs({phpVersion: version});
		assert.equal(lib.name, `php${version}-fileinfo.so`);
		assert.equal(lib.url.href, pathToFileURL(path.join(directory, 'package', lib.name)).href);
		assert.equal(lib.ini, true);
		const loader = await import(pathToFileURL(path.join(directory, 'package', `${version}.mjs`)));
		assert.deepEqual(loader.getLibs(), [lib]);
		if(fs.existsSync(path.join(root, 'packages/fileinfo', lib.name)))
		{
			assert.ok(fs.existsSync(fileURLToPath(lib.url)), lib.name);
		}
	}
});
