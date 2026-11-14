import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';

import {nodeRuntimeOptions} from '../lib/node-runtime-options.mjs';

const {nodeRuntimeOptions: commonJsRuntimeOptions} = createRequire(import.meta.url)('../lib/node-runtime-options.cjs');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const makefile = `
PHP_VERSION=8.4
ENV_FILE=/dev/null
include packages/pdo-pglite/pre.mak
include packages/vrzno/pre.mak
include packages/waitline/pre.mak

print:
	@printf '%s\\n' "vrzno=\$(WITH_VRZNO)" "pdo=\$(WITH_PDO_PGLITE)" "waitline=\$(WITH_WAITLINE)" "configure=\$(CONFIGURE_FLAGS)" "modules=\$(EXTRA_MODULES)"
`;

const evaluateModes = variables => spawnSync(
	'make',
	['--no-print-directory', '-s', '-f', '-', ...Object.entries(variables).map(([key, value]) => `${key}=${value}`), 'print'],
	{cwd: repoRoot, encoding: 'utf8', input: makefile}
);

test('bridge extension compatibility aliases stay static', () => {
	const result = evaluateModes({WITH_VRZNO: 1, WITH_PDO_PGLITE: 1, WITH_WAITLINE: 1});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^vrzno=static$/m);
	assert.match(result.stdout, /^pdo=static$/m);
	assert.match(result.stdout, /^waitline=static$/m);
	assert.match(result.stdout, /--enable-vrzno/);
	assert.match(result.stdout, /--enable-pdo-pglite/);
	assert.match(result.stdout, /--enable-waitline/);
	assert.doesNotMatch(result.stdout, /packages\/(?:vrzno|pdo-pglite|waitline)\/php8\.4-/);
});

test('dynamic bridge modes emit three versioned side modules', () => {
	const result = evaluateModes({WITH_VRZNO: 'dynamic', WITH_PDO_PGLITE: 'dynamic', WITH_WAITLINE: 'dynamic'});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^vrzno=dynamic$/m);
	assert.match(result.stdout, /^pdo=dynamic$/m);
	assert.match(result.stdout, /^waitline=dynamic$/m);
	assert.doesNotMatch(result.stdout, /--enable-(?:vrzno|pdo-pglite|waitline)/);
	assert.match(result.stdout, /packages\/vrzno\/php8\.4-vrzno\.so/);
	assert.match(result.stdout, /packages\/pdo-pglite\/php8\.4-pdo-pglite\.so/);
	assert.match(result.stdout, /packages\/waitline\/php8\.4-waitline\.so/);
});

test('dynamic PDO-PGlite uses the static Vrzno bridge without building it twice', () => {
	const result = evaluateModes({WITH_VRZNO: 'static', WITH_PDO_PGLITE: 'dynamic', WITH_WAITLINE: 'static'});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /--enable-vrzno/);
	assert.doesNotMatch(result.stdout, /--enable-pdo-pglite/);
	assert.match(result.stdout, /packages\/pdo-pglite\/php8\.4-pdo-pglite\.so/);
	assert.doesNotMatch(result.stdout, /packages\/(?:vrzno|waitline)\/php8\.4-/);
});

test('shared PDO-PGlite falls back to built-in bindings without a native provider library', () => {
	const result = evaluateModes({WITH_VRZNO: 'static', WITH_PDO_PGLITE: 'shared', WITH_WAITLINE: 'static'});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^pdo=static$/m);
	assert.match(result.stdout, /--enable-pdo-pglite/);
	assert.doesNotMatch(result.stdout, /packages\/pdo-pglite\/php8\.4-/);
});

test('PDO-PGlite rejects disabled Vrzno and static bindings with a dynamic bridge', () => {
	for(const variables of [
		{WITH_VRZNO: 0, WITH_PDO_PGLITE: 1}
		, {WITH_VRZNO: 0, WITH_PDO_PGLITE: 'dynamic'}
		, {WITH_VRZNO: 'dynamic', WITH_PDO_PGLITE: 'static'}
	]) {
		const result = evaluateModes({...variables, WITH_WAITLINE: 0});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /requires WITH_VRZNO=/);
	}
});

test('side-module recipes retain embedded JS and PDO depends on Vrzno headers', () => {
	const vrznoMake = fs.readFileSync(path.join(repoRoot, 'packages/vrzno/static.mak'), 'utf8');
	const pdoMake = fs.readFileSync(path.join(repoRoot, 'packages/pdo-pglite/static.mak'), 'utf8');
	const waitlineMake = fs.readFileSync(path.join(repoRoot, 'packages/waitline/static.mak'), 'utf8');

	for(const source of [vrznoMake, pdoMake, waitlineMake])
	{
		assert.match(source, /\$\{SIDE_MODULE_FLAGS\}/);
		assert.match(source, /-Wl,--whole-archive \.libs\//);
		assert.match(source, /-Wno-int-conversion/);
	}
	assert.match(vrznoMake, /php\$\{PHP_VERSION\}-src\/ext\/vrzno/);
	assert.match(pdoMake, /php\$\{PHP_VERSION\}-src\/ext\/pdo_pglite/);
	assert.match(pdoMake, /php\$\{PHP_VERSION\}-pdo-pglite\.so: \$\{PHPIZE\} \$\{VRZNO_EXTENSION_STAMP\}/);
	assert.doesNotMatch(pdoMake, /php\$\{PHP_VERSION\}-pdo-pglite\.so: [^\n]*vrzno\.so/);
});

test('package loaders select every supported version without adding a second Vrzno', async () => {
	const [vrzno, pdoPglite, waitline] = await Promise.all([
		import('../../packages/vrzno/index.mjs')
		, import('../../packages/pdo-pglite/index.mjs')
		, import('../../packages/waitline/index.mjs')
	]);
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		const php = {phpVersion: version};
		for(const [name, loader] of [['vrzno', vrzno], ['waitline', waitline], ...(version === '8.0' ? [] : [['pdo-pglite', pdoPglite]])])
		{
			const [library] = loader.getLibs(php);
			assert.equal(loader.getLibs(php).length, 1);
			assert.equal(library.name, `php${version}-${name}.so`);
			assert.equal(library.url.href, new URL(`../../packages/${name}/${library.name}`, import.meta.url).href);
			assert.equal(library.ini, true);
		}
	}
	assert.throws(() => pdoPglite.getLibs({phpVersion: '8.0'}), /does not support PHP 8\.0/);
});

test('PHP 8.0 disables PDO-PGlite by default and rejects an explicit unsupported build', () => {
	const defaults = evaluateModes({PHP_VERSION: '8.0'});
	assert.equal(defaults.status, 0, defaults.stderr);
	assert.match(defaults.stdout, /^pdo=0$/m);
	const enabled = evaluateModes({PHP_VERSION: '8.0', WITH_PDO_PGLITE: 'dynamic'});
	assert.notEqual(enabled.status, 0);
	assert.match(enabled.stderr, /requires PHP 8\.1 or newer/);
});

test('Node dynamic runtime plumbing loads bridge extensions in dependency order', () => {
	const options = nodeRuntimeOptions({runtime: 'php', version: '8.4'}, {
		PHP_VERSION: '8.4'
		, WITH_VRZNO: 'dynamic'
		, WITH_PDO_PGLITE: 'dynamic'
		, WITH_WAITLINE: 'dynamic'
	});
	assert.deepEqual(options.sharedLibs.map(pkg => pkg.__packageKey), ['vrzno', 'pdo-pglite']);
	assert.deepEqual(options.sharedLibs.flatMap(pkg => pkg.getLibs().map(lib => lib.name)), [
		'php8.4-vrzno.so'
		, 'php8.4-pdo-pglite.so'
	]);
});

test('standard runtime test helpers load only PDO-PGlite in the dynamic profile', () => {
	for(const runtime of ['php', 'cgi', 'cli', 'dbg'])
	{
		const options = nodeRuntimeOptions({runtime, version: '8.4'}, {
			PHP_VERSION: '8.4'
			, WITH_VRZNO: 'static'
			, WITH_PDO_PGLITE: 'dynamic'
			, WITH_WAITLINE: 'static'
		});
		const bridges = options.sharedLibs.filter(pkg => ['vrzno', 'pdo-pglite', 'waitline'].includes(pkg.__packageKey));
		assert.deepEqual(bridges.map(pkg => pkg.__packageKey), ['pdo-pglite'], runtime);
	}
});

test('CI profiles preserve static Vrzno and Waitline and select PDO-PGlite by profile', () => {
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		for(const profile of ['dynamic', 'shared', 'static'])
		{
			const source = fs.readFileSync(path.join(repoRoot, `.github/.env_${version}.${profile}.ci`), 'utf8');
			assert.match(source, /^WITH_VRZNO=static$/m);
			assert.match(source, /^WITH_WAITLINE=static$/m);
			assert.match(source, new RegExp(`^WITH_PDO_PGLITE=${version === '8.0' ? '0' : profile}$`, 'm'));
		}
	}
});

test('CommonJS and ESM helpers agree on bridge libraries for every runtime and mode', () => {
	for(const runtime of ['php', 'cgi', 'cli', 'dbg'])
	{
		for(const mode of ['0', '1', 'static', 'shared', 'dynamic'])
		{
			const options = {runtime, version: '8.4'};
			const env = {PHP_VERSION: '8.4', WITH_VRZNO: 'static', WITH_PDO_PGLITE: mode, WITH_WAITLINE: 'static'};
			const libraries = helper => (helper(options, env).sharedLibs ?? []).flatMap(pkg => pkg.getLibs().map(lib => lib.name));
			assert.deepEqual(libraries(commonJsRuntimeOptions), libraries(nodeRuntimeOptions), `${runtime}/${mode}`);
		}
	}
});

test('the nightly Cloudflare profile retains only its selected static extensions', () => {
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		const result = spawnSync('make', [
			'--no-print-directory'
			, '-s'
			, 'ENV_FILE=profiles/cloudflare.mak'
			, 'BUILD_WORKSPACE='
			, `PHP_VERSION=${version}`
			, '--eval'
			, '__bridge_inventory:;@printf "%s\\n" "extensions=$(EXTENSION_PACKAGE_DIRS)" "shared=$(SHARED_LIBS)" "dynamic=$(DYNAMIC_LIBS)" "main=$(MAIN_MODULE)" "vrzno=$(WITH_VRZNO)" "cfd1=$(WITH_PDO_CFD1)" "pdo=$(WITH_PDO_PGLITE)" "configure=$(CONFIGURE_FLAGS)" "memory=$(INITIAL_MEMORY)/$(MAXIMUM_MEMORY)" "optimize=$(OPTIMIZE)"'
			, '__bridge_inventory'
		], {cwd: repoRoot, encoding: 'utf8'});
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^extensions=packages\/vrzno packages\/pdo-cfd1 packages\/zlib packages\/libzip packages\/curl$/m);
		assert.match(result.stdout, /^shared=$/m);
		assert.match(result.stdout, /^dynamic=$/m);
		assert.match(result.stdout, /^main=0$/m);
		assert.match(result.stdout, /^vrzno=static$/m);
		assert.match(result.stdout, /^cfd1=1$/m);
		assert.match(result.stdout, /^pdo=0$/m);
		assert.match(result.stdout, /--enable-vrzno/);
		assert.doesNotMatch(result.stdout, /--enable-(?:pdo-pglite|waitline)/);
		assert.match(result.stdout, /^memory=64MB\/96MB$/m);
		assert.match(result.stdout, /^optimize=z$/m);
	}
});
