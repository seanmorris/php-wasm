import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { allowedSource, buildCloudflare, snapshot } from '../../bin/build-cloudflare.mjs';
import { cloudflarePackageFiles, packageCloudflare, repackageCloudflare, verifyCloudflare } from '../../bin/package-cloudflare.mjs';
import { mergeCloudflare } from '../../bin/merge-cloudflare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = data => createHash('sha256').update(data).digest('hex');
const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const helpers = ['PhpCloudflare.mjs', 'PhpBase.mjs', 'OutputBuffer.mjs', '_Event.mjs', 'fsOps.mjs', 'resolveDependencies.mjs'];
const declarations = ['PhpCloudflare.d.mts', 'PhpBase.d.mts', 'public.d.ts'];

/**
 * Creates a fixture directory cleaned up when its test finishes.
 * @param {import('node:test').TestContext} t Test context.
 * @returns {Promise<string>} Fixture path.
 */
async function temporary(t)
{
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'php-cloudflare-packaging-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	return root;
}

/**
 * Stages a tiny valid Wasm binary, matching factory and real source helpers.
 * @param {string} root Fixture directory.
 * @param {string} version Selected PHP version.
 * @returns {Promise<string>} Fixture directory.
 */
async function stage(root, version = '8.3')
{
	await fs.mkdir(root, {recursive: true});
	const runtime = `php${version}-cloudflare-runtime.mjs`;
	await fs.writeFile(path.join(root, runtime), `const wasmFile = '${runtime}.wasm';\nexport default async function runtime(args) { return args; }\n`);
	await fs.writeFile(path.join(root, `${runtime}.wasm`), wasm);
	for(const name of helpers) await fs.copyFile(path.join(repoRoot, 'source', name), path.join(root, name));
	for(const name of [...declarations, ...cloudflarePackageFiles]) await fs.copyFile(path.join(repoRoot, 'packages/php-cloud-wasm', name), path.join(root, name));
	return root;
}

/**
 * Produces the final packaged fixture through the production packager.
 * @param {string} root Fixture directory.
 * @param {string} version Selected PHP version.
 * @returns {Promise<string>} Fixture directory.
 */
async function packaged(root, version = '8.3')
{
	await stage(root, version);
	await packageCloudflare(root, version, {fixture: true});
	return root;
}

/**
 * Modifies a fixture manifest for negative verification cases.
 * @param {string} root Fixture directory.
 * @param {(manifest: object) => unknown} mutate Manifest mutation.
 * @param {string} version Selected PHP version.
 * @returns {Promise<void>} Resolves after saving the mutated manifest.
 */
async function editManifest(root, mutate, version = '8.3')
{
	const name = path.join(root, `php${version}-cloudflare.manifest.json`);
	const manifest = JSON.parse(await fs.readFile(name, 'utf8'));
	await mutate(manifest);
	await fs.writeFile(name, JSON.stringify(manifest));
}

/**
 * Refreshes the digest after an intentional fixture asset edit.
 * @param {string} root Fixture directory.
 * @param {string} name Asset filename.
 * @param {string} version Selected PHP version.
 * @returns {Promise<void>} Resolves after updating the manifest.
 */
async function refreshDigest(root, name, version = '8.3')
{
	await editManifest(root, async manifest => {
		const data = await fs.readFile(path.join(root, name));
		Object.assign(manifest.files.find(file => file.path === name), {sha256: digest(data), bytes: data.length});
	}, version);
}

/**
 * Captures all file digests to detect partial destination writes.
 * @param {string} root Fixture directory.
 * @returns {Promise<object>} Filename to digest map.
 */
async function tree(root)
{
	return Object.fromEntries(await Promise.all((await fs.readdir(root)).sort().map(async name => [name, digest(await fs.readFile(path.join(root, name)))])));
}

test('Cloudflare source filtering excludes environment files, generated assets and dependency trees', () => {
	for(const name of ['source/.env', 'source/.env.local', 'packages/vrzno/.php-wasm-rc', 'source/node_modules/a.js', 'bin/.git/config', 'packages/php-cloud-wasm/mapped/index.js', 'packages/php-cloud-wasm/php8.3-node.mjs', 'packages/php-cloud-wasm/old.manifest.json', 'source/runtime.wasm', 'packages/zlib/libz.so', 'source/debug.log', 'bin/.npmrc', 'source/.aws/credentials', 'packages/vrzno/.ssh/id_rsa', 'source/certificate.pem', 'source/private.key', 'source/certificate.p12', 'source/certificate.pfx'])
	{
		assert.equal(allowedSource(name), false, name);
	}
	for(const name of ['source/PhpBase.mjs', 'source/pib/pib.c', 'profiles/cloudflare.mak', 'packages/php-cloud-wasm/public.d.ts', 'packages/php-cloud-wasm/PhpCloudflare.d.mts', 'packages/vrzno/import-source.mjs'])
	{
		assert.equal(allowedSource(name), true, name);
	}
});

test('Cloudflare snapshot hashes only selected sources and never follows symlinks', async t => {
	const root = await temporary(t);
	const fixture = path.join(root, 'fixture');
	await fs.mkdir(fixture);
	for(const name of ['Makefile', 'php.mk', 'info.mak', 'ico.ans', 'compress-package.sh', 'emscripten-builder.dockerfile']) await fs.writeFile(path.join(fixture, name), 'fixture source\n');
	for(const name of ['source', 'patch', 'profiles', 'bin', ...['vrzno', 'pdo-cfd1', 'zlib', 'libzip', 'php-cloud-wasm', 'php-cgi-wasm', 'php-cli-wasm', 'php-dbg-wasm'].map(name => `packages/${name}`)]) await fs.mkdir(path.join(fixture, name), {recursive: true});
	await fs.writeFile(path.join(fixture, 'source/probe.c'), 'int main(void) { return 0; }\n');
	await fs.writeFile(path.join(fixture, 'source/.env'), 'FIXTURE_SECRET=never-copy\n');
	await fs.writeFile(path.join(fixture, 'source/private.key'), 'fixture key, not a real credential\n');
	await fs.writeFile(path.join(fixture, 'packages/php-cloud-wasm/old.wasm'), wasm);
	const first = path.join(root, 'first');
	const firstHash = await snapshot(first, fixture);
	assert.match(firstHash, /^[a-f0-9]{64}$/);
	assert.deepEqual(await fs.readdir(path.join(first, 'source')), ['probe.c']);
	await fs.writeFile(path.join(fixture, 'source/.env'), 'FIXTURE_SECRET=changed\n');
	assert.equal(await snapshot(path.join(root, 'second'), fixture), firstHash);
	await fs.appendFile(path.join(fixture, 'source/probe.c'), '// changed source\n');
	assert.notEqual(await snapshot(path.join(root, 'third'), fixture), firstHash);
	await fs.symlink('../source/private.key', path.join(fixture, 'bin/linked.h'));
	await assert.rejects(snapshot(path.join(root, 'symlink'), fixture), /does not follow symlinks: bin\/linked.h/);
});

test('Cloudflare builder rejects invalid versions and job counts before Docker or snapshot work', async () => {
	await assert.rejects(buildCloudflare({phpVersion: '8.3; echo bad'}), /Unsupported PHP version/);
	const original = process.env.CLOUDFLARE_JOBS;
	try
	{
		for(const jobs of ['0', '-1', '1.5', '65', 'bad'])
		{
			process.env.CLOUDFLARE_JOBS = jobs;
			await assert.rejects(buildCloudflare({phpVersion: '8.3'}), /CLOUDFLARE_JOBS/);
		}
	}
	finally
	{
		if(original === undefined) delete process.env.CLOUDFLARE_JOBS;
		else process.env.CLOUDFLARE_JOBS = original;
	}
});

test('Cloudflare packaging hashes Wasm before generating the fixed adapter and declarations', async t => {
	const root = await packaged(await temporary(t));
	const {manifest} = await verifyCloudflare(root, '8.3');
	const wasmName = `${createHash('sha1').update(wasm).digest('hex')}.wasm`;
	const adapter = await fs.readFile(path.join(root, manifest.entrypoint), 'utf8');
	assert.match(adapter, new RegExp(`from './${wasmName}'`));
	assert.match(await fs.readFile(path.join(root, manifest.runtime), 'utf8'), new RegExp(wasmName));
	assert.equal(await fs.stat(path.join(root, `${manifest.runtime}.wasm`)).then(() => true, () => false), false);
	for(const name of [...helpers, ...declarations, 'php8.3-cloudflare.d.mts']) assert.ok(manifest.files.some(file => file.path === name), name);
	assert.equal(manifest.schema, 2);
	assert.equal(manifest.packageName, 'php-cloud-wasm');
	for(const name of cloudflarePackageFiles) assert.ok(manifest.files.some(file => file.path === name), name);
	assert.match(await fs.readFile(path.join(root, 'php8.3-cloudflare.d.mts'), 'utf8'), /constructor\(args\?: PhpCloudflareOptions\)/);

	// Test the generated constructor independently of Node's lack of Wasm ESM.
	const mockImports = `class CloudflareBase { constructor(args) { this.args = args; } }\nconst runtime = () => {}; const wasmModule = {};\n`;
	const executable = mockImports + adapter.replace(/^import .*;\n/gm, '');
	const {PhpCloudflare} = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);
	const instance = new PhpCloudflare({runtime: 'wrong', wasmModule: 'wrong', version: '8.0', shared: {local: true}});
	assert.equal(instance.args.version, '8.3');
	assert.equal(typeof instance.args.runtime, 'function');
	assert.deepEqual(instance.args.wasmModule, {});
	assert.deepEqual(instance.args.shared, {local: true});
	const before = await tree(root);
	await packageCloudflare(root, '8.3');
	assert.deepEqual(await tree(root), before, 'Packaging a verified output is idempotent');
});

test('Cloudflare packaging rejects invalid Wasm and mismatched factory filenames', async t => {
	const root = await stage(await temporary(t));
	await fs.writeFile(path.join(root, 'php8.3-cloudflare-runtime.mjs.wasm'), 'not wasm');
	await assert.rejects(packageCloudflare(root, '8.3'), /Invalid Cloudflare WebAssembly/);
	await fs.writeFile(path.join(root, 'php8.3-cloudflare-runtime.mjs.wasm'), wasm);
	await fs.writeFile(path.join(root, 'php8.3-cloudflare-runtime.mjs'), 'export default () => {};');
	await assert.rejects(packageCloudflare(root, '8.3'), /matching Wasm output/);
	await assert.rejects(packageCloudflare(root, '../8.3'), /Unsupported PHP version/);
});

test('Cloudflare packaging supports output paths with spaces without touching the caller directory', async t => {
	const root = await temporary(t);
	const output = await stage(path.join(root, 'output with spaces'));
	const caller = path.join(root, 'caller');
	await fs.mkdir(caller);
	await fs.writeFile(path.join(caller, 'sentinel'), 'untouched');
	const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/package-cloudflare.mjs'), output, '8.3'], {cwd: caller, encoding: 'utf8'});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	await verifyCloudflare(output, '8.3');
	assert.deepEqual(await fs.readdir(caller), ['sentinel']);
	assert.equal(await fs.readFile(path.join(caller, 'sentinel'), 'utf8'), 'untouched');
});

test('Cloudflare manifest rejects altered, missing, duplicate, traversal and side assets', async t => {
	const base = await packaged(path.join(await temporary(t), 'base'));
	const cases = [
		['changed bytes', async root => fs.appendFile(path.join(root, 'PhpBase.mjs'), '\n// changed')]
		, ['missing file', async root => fs.unlink(path.join(root, 'PhpBase.mjs'))]
		, ['duplicate', async root => editManifest(root, manifest => manifest.files.push(manifest.files[0]))]
		, ['traversal', async root => editManifest(root, manifest => manifest.files[0].path = '../outside')]
		, ['absolute path', async root => editManifest(root, manifest => manifest.files[0].path = '/outside')]
		, ['native side library', async root => editManifest(root, manifest => manifest.files.push({path: 'extension.so', sha256: 'a'.repeat(64)}))]
		, ['side data', async root => editManifest(root, manifest => manifest.files.push({path: 'runtime.data', sha256: 'a'.repeat(64)}))]
		, ['compressed side library', async root => editManifest(root, manifest => manifest.files.push({path: 'extension.so.gz', sha256: 'a'.repeat(64)}))]
		, ['ICU side data', async root => editManifest(root, manifest => manifest.files.push({path: 'icudt.dat', sha256: 'a'.repeat(64)}))]
		, ['invalid digest', async root => editManifest(root, manifest => manifest.files[0].sha256 = 'no')]
		, ['invalid size', async root => editManifest(root, manifest => manifest.files[0].bytes = -1)]
		, ['wrong version', async root => editManifest(root, manifest => manifest.phpVersion = '8.0')]
		, ['missing adapter', async root => editManifest(root, manifest => manifest.files = manifest.files.filter(file => file.path !== manifest.entrypoint))]
		, ['missing declaration', async root => editManifest(root, manifest => manifest.files = manifest.files.filter(file => file.path !== 'public.d.ts'))]
		, ['missing package metadata', async root => editManifest(root, manifest => manifest.files = manifest.files.filter(file => file.path !== 'package.json'))]
		, ['wrong package name', async root => editManifest(root, manifest => manifest.packageName = 'php-wasm')]
		, ['unowned dependency', async root => editManifest(root, manifest => manifest.files = manifest.files.filter(file => file.path !== 'OutputBuffer.mjs'))]
	];
	for(const [name, mutate] of cases)
	{
		await t.test(name, async () => {
			const root = `${base}-${name.replaceAll(' ', '-')}`;
			await fs.cp(base, root, {recursive: true});
			await mutate(root);
			await assert.rejects(verifyCloudflare(root, '8.3'));
		});
	}
});

test('Cloudflare verification rejects a symlink in place of a manifest-owned asset', async t => {
	const root = await packaged(await temporary(t));
	await fs.rename(path.join(root, 'PhpBase.mjs'), path.join(root, 'outside.mjs'));
	await fs.symlink('outside.mjs', path.join(root, 'PhpBase.mjs'));
	await assert.rejects(verifyCloudflare(root, '8.3'), /Non-regular Cloudflare asset/);
});

test('Cloudflare verification rejects a symlinked manifest', async t => {
	const root = await packaged(await temporary(t));
	const name = 'php8.3-cloudflare.manifest.json';
	await fs.rename(path.join(root, name), path.join(root, 'outside.json'));
	await fs.symlink('outside.json', path.join(root, name));
	await assert.rejects(verifyCloudflare(root, '8.3'), /manifest must be a regular file/);
});

test('Cloudflare verification validates Wasm content and content-addressed filenames independently', async t => {
	const root = await packaged(await temporary(t));
	const {manifest} = await verifyCloudflare(root, '8.3');
	const originalName = manifest.files.find(file => file.path.endsWith('.wasm')).path;
	// A valid module with an empty custom section has a different SHA1.
	const otherWasm = Buffer.from([...wasm, 0, 2, 1, 97]);
	assert.ok(WebAssembly.validate(otherWasm));
	await fs.writeFile(path.join(root, originalName), otherWasm);
	await refreshDigest(root, originalName);
	await assert.rejects(verifyCloudflare(root, '8.3'), /content-address mismatch/);

	const invalid = Buffer.from('not a WebAssembly module');
	const invalidName = `${createHash('sha1').update(invalid).digest('hex')}.wasm`;
	await fs.writeFile(path.join(root, invalidName), invalid);
	await editManifest(root, data => {
		Object.assign(data.files.find(file => file.path === originalName), {path: invalidName, sha256: digest(invalid), bytes: invalid.length});
	});
	for(const name of [manifest.entrypoint, manifest.runtime])
	{
		const contents = await fs.readFile(path.join(root, name), 'utf8');
		await fs.writeFile(path.join(root, name), contents.replaceAll(originalName, invalidName));
		await refreshDigest(root, name);
	}
	await assert.rejects(verifyCloudflare(root, '8.3'), /Invalid Cloudflare WebAssembly artifact/);
});

test('Cloudflare merge combines matching versions and preserves unrelated package assets', async t => {
	const root = await temporary(t);
	const first = await packaged(path.join(root, 'first'), '8.3');
	const second = await packaged(path.join(root, 'second'), '8.4');
	const destination = path.join(root, 'destination');
	await fs.mkdir(destination);
	await fs.writeFile(path.join(destination, 'php8.3-node.mjs'), 'unrelated node runtime');
	await mergeCloudflare(destination, [first, second]);
	await verifyCloudflare(destination, '8.3');
	await verifyCloudflare(destination, '8.4');
	assert.equal(await fs.readFile(path.join(destination, 'php8.3-node.mjs'), 'utf8'), 'unrelated node runtime');
	const before = await tree(destination);
	await mergeCloudflare(destination, [first, second]);
	assert.deepEqual(await tree(destination), before);
});

test('Cloudflare merge preflights conflicting sources and destination without partial writes', async t => {
	const root = await temporary(t);
	const first = await packaged(path.join(root, 'first'), '8.3');
	const second = await packaged(path.join(root, 'second'), '8.4');
	await fs.appendFile(path.join(second, 'PhpBase.mjs'), '\n// different helper');
	await refreshDigest(second, 'PhpBase.mjs', '8.4');
	const destination = path.join(root, 'destination');
	await fs.mkdir(destination);
	await fs.writeFile(path.join(destination, 'sentinel'), 'unchanged');
	const before = await tree(destination);
	await assert.rejects(mergeCloudflare(destination, [first, second]), /Conflicting Cloudflare asset/);
	assert.deepEqual(await tree(destination), before);
	await fs.writeFile(path.join(destination, 'php8.3-cloudflare-runtime.mjs'), 'conflicting runtime');
	const overlap = await tree(destination);
	await assert.rejects(mergeCloudflare(destination, [first]), /Conflicting destination asset/);
	assert.deepEqual(await tree(destination), overlap);
});

test('Cloudflare generated replacement updates stale helpers but never follows destination symlinks', async t => {
	const root = await temporary(t);
	const source = await packaged(path.join(root, 'source'));
	const destination = path.join(root, 'destination');
	await fs.mkdir(destination);
	await fs.writeFile(path.join(destination, 'PhpBase.mjs'), 'stale helper');
	await mergeCloudflare(destination, [source], {replaceGenerated: true});
	await verifyCloudflare(destination, '8.3');
	await fs.rename(path.join(destination, 'PhpBase.mjs'), path.join(root, 'outside.mjs'));
	const outside = await fs.readFile(path.join(root, 'outside.mjs'));
	await fs.symlink('../outside.mjs', path.join(destination, 'PhpBase.mjs'));
	await assert.rejects(mergeCloudflare(destination, [source], {replaceGenerated: true}), /Non-regular destination asset/);
	assert.deepEqual(await fs.readFile(path.join(root, 'outside.mjs')), outside);
});

test('Cloudflare rebuilding cannot invalidate an existing other-version manifest', async t => {
	const root = await temporary(t);
	const old = await packaged(path.join(root, 'old'), '8.3');
	const replacement = await packaged(path.join(root, 'replacement'), '8.4');
	await fs.appendFile(path.join(replacement, 'PhpBase.mjs'), '\n// updated helper\n');
	await refreshDigest(replacement, 'PhpBase.mjs', '8.4');
	const destination = path.join(root, 'destination');
	await mergeCloudflare(destination, [old]);
	const before = await tree(destination);
	await assert.rejects(mergeCloudflare(destination, [replacement], {replaceGenerated: true}), /would invalidate/);
	assert.deepEqual(await tree(destination), before);
	await verifyCloudflare(destination, '8.3');
});

test('Cloudflare profile overrides user configuration without evaluating its environment file', async t => {
	const root = await temporary(t);
	const fixtureConfig = path.join(root, 'fixture-settings.mak');
	await fs.writeFile(fixtureConfig, '$(error This fixture configuration must not be evaluated)\n');
	const result = spawnSync('make', ['--no-print-directory', '--dry-run', 'cloudflare-mjs', 'PHP_VERSION=8.3', `ENV_FILE=${fixtureConfig}`, 'MAIN_MODULE=1', 'WITH_ZLIB=shared'], {cwd: repoRoot, encoding: 'utf8', env: {...process.env, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /build-cloudflare.mjs --php-version '8.3'/);
	const mixed = spawnSync('make', ['--no-print-directory', '--dry-run', 'cloudflare-mjs', 'node-mjs'], {cwd: repoRoot, encoding: 'utf8', env: {...process.env, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}});
	assert.notEqual(mixed.status, 0);
	assert.match(mixed.stderr, /Cloudflare targets must run separately/);
});

test('Cloudflare CLI rejects unsupported module and SAPI combinations before invoking Make', () => {
	for(const args of [['cloudflare', 'js'], ['cloudflare', 'cgi'], ['cloudflare', 'cli'], ['cloudflare', 'dbg']])
	{
		const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/php-wasm-builder.js'), 'build', ...args], {cwd: repoRoot, encoding: 'utf8'});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Cloudflare supports embedded PHP ESM only/);
	}
});

test('Cloudflare CLI defaults to ESM and does not pass the caller configuration to Make', async t => {
	const root = await temporary(t);
	const bin = path.join(root, 'bin');
	const log = path.join(root, 'make-arguments.json');
	await fs.mkdir(bin);
	await fs.writeFile(path.join(root, '.php-wasm-rc'), '$(error Fixture configuration must not be read)\n');
	await fs.writeFile(path.join(bin, 'make'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CLOUDFLARE_TEST_MAKE_LOG, JSON.stringify(process.argv.slice(2)));\n`, {mode: 0o755});
	const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/php-wasm-builder.js'), 'build', 'cloudflare'], {
		cwd: root
		, encoding: 'utf8'
		, env: {...process.env, PATH: `${bin}:${process.env.PATH}`, CLOUDFLARE_TEST_MAKE_LOG: log}
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const args = JSON.parse(await fs.readFile(log, 'utf8'));
	assert.ok(args.includes('cloudflare-mjs'));
	assert.ok(args.includes('BUILD_TYPE=mjs'));
	assert.ok(!args.some(arg => arg.startsWith('ENV_FILE=')));
	assert.ok(args.includes(`CLOUDFLARE_OUTPUT_DIR=${path.join(root, 'packages/php-cloud-wasm')}`));
	assert.ok(args.includes(`CLOUDFLARE_CACHE_DIR=${path.join(root, '.cache/cloudflare')}`));
	assert.ok(!args.some(arg => /^(?:PHP_BUILDER_DIR|ENV_DIR)=/.test(arg)));
});

test('Cloudflare CLI passes paths with spaces and apostrophes intact through real Make', async t => {
	const root = await temporary(t);
	const consumer = path.join(root, "consumer's project");
	const bin = path.join(root, 'bin');
	const log = path.join(root, 'node-arguments.json');
	await fs.mkdir(consumer);
	await fs.mkdir(bin);
	await fs.writeFile(path.join(bin, 'node'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CLOUDFLARE_TEST_NODE_LOG, JSON.stringify(process.argv.slice(2)));\n`, {mode: 0o755});
	const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/php-wasm-builder.js'), 'build', 'cloudflare'], {
		cwd: consumer
		, encoding: 'utf8'
		, env: {...process.env, PATH: `${bin}:${process.env.PATH}`, CLOUDFLARE_TEST_NODE_LOG: log}
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const args = JSON.parse(await fs.readFile(log, 'utf8'));
	assert.equal(args[0], 'bin/build-cloudflare.mjs');
	assert.equal(args[args.indexOf('--output') + 1], path.join(consumer, 'packages/php-cloud-wasm'));
	assert.equal(args[args.indexOf('--cache-root') + 1], path.join(consumer, '.cache/cloudflare'));
	assert.doesNotMatch(result.stderr, /overriding recipe|mixed implicit and normal rules/);
});

test('Cloudflare container shim preserves working directory, environment values and exit status', async t => {
	const root = await temporary(t);
	const shim = path.join(repoRoot, 'bin/cloudflare-container-run.mjs');
	const result = spawnSync(process.execPath, [shim, '-p', 'fixture', 'run', '-T', '--rm', '-w', root, '-e', 'CLOUDFLARE_TEST_VALUE=a=b', 'emscripten-builder', process.execPath, '-e', 'console.log(JSON.stringify({cwd:process.cwd(),value:process.env.CLOUDFLARE_TEST_VALUE}));process.exit(7)'], {encoding: 'utf8'});
	assert.equal(result.status, 7, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout), {cwd: root, value: 'a=b'});
	for(const args of [[], ['--bad'], ['-w'], ['-e'], ['emscripten-builder']])
	{
		const invalid = spawnSync(process.execPath, [shim, ...args], {encoding: 'utf8'});
		assert.notEqual(invalid.status, 0);
	}
});

test('Cloudflare npm package retains every verified manifest asset', async t => {
	const root = await temporary(t);
	const output = await packaged(path.join(root, 'package'));
	await fs.copyFile(path.join(repoRoot, 'packages/php-cloud-wasm/package.json'), path.join(output, 'package.json'));
	const result = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root, '--cache', path.join(root, 'npm-cache')], {cwd: output, encoding: 'utf8'});
	assert.equal(result.status, 0, result.stderr);
	const packed = JSON.parse(result.stdout)[0];
	const names = new Set(packed.files.map(file => file.path));
	const {manifest, manifestName} = await verifyCloudflare(output, '8.3');
	for(const name of [manifestName, ...manifest.files.map(file => file.path)]) assert.ok(names.has(name), `npm pack omitted ${name}`);
});

test('standalone Cloudflare package owns its exports without changing base environment entries', async () => {
	const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'packages/php-cloud-wasm/package.json'), 'utf8'));
	const base = JSON.parse(await fs.readFile(path.join(repoRoot, 'packages/php-wasm/package.json'), 'utf8'));
	assert.equal(pkg.name, 'php-cloud-wasm');
	assert.equal(pkg.exports['./*.mjs'], './*.mjs');
	assert.equal(pkg.exports['./PhpCloudflare'].types, './PhpCloudflare.d.mts');
	assert.equal(pkg.exports['./PhpCloudflare'].import, './PhpCloudflare.mjs');
	assert.ok(pkg.files.includes('php*-cloudflare.manifest.json'));
	assert.equal(pkg.dependencies, undefined, 'Worker package must not depend on php-wasm');
	assert.equal(pkg.exports['.'], undefined, 'Each artifact has an explicit PHP version');
	for(const name of ['PhpBase', 'PhpNode', 'PhpWeb']) assert.ok(base.exports[`./${name}`]);
	assert.equal(base.exports['./PhpCloudflare'], undefined);
	assert.equal(base.exports['./PhpCloudflare.mjs'], undefined);
	assert.doesNotMatch(await fs.readFile(path.join(repoRoot, 'packages/php-wasm/public.d.ts'), 'utf8'), /PhpCloudflare/);
});

test('normal-only ESM builds do not select standalone Cloudflare package assets', async t => {
	const root = await temporary(t);
	const output = path.join(root, 'normal-only');
	const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'packages/php-cloud-wasm/package.json'), 'utf8'));
	const helper = path.join(output, pkg.exports['./PhpCloudflare'].import);
	const environments = ['web', 'worker', 'webview', 'node'];
	// Recursive Make calls are replaced with a no-op so this inspects the real
	// normal-build recipes without compiling PHP or consulting existing assets.
	const result = spawnSync('make', [
		'--no-print-directory', '--dry-run'
		, ...environments.map(name => `${name}-mjs`)
		, 'MAKE=true', 'ENV_FILE=/dev/null'
		, 'EXTENSION_PACKAGE_DIRS=', 'PHP_VERSION=8.3'
		, `PHP_DIST_DIR=${output}`
	], {
		cwd: repoRoot, encoding: 'utf8'
		, env: {...process.env, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	for(const environment of environments)
	{
		const runtime = path.join(output, `php8.3-${environment}.mjs`);
		const selection = result.stdout.split('\n').find(line => line.startsWith('true ') && line.split(/\s+/).includes(runtime));
		assert.ok(selection, `${environment} build must select its normal runtime`);
		assert.ok(!selection.split(/\s+/).includes(helper), `${environment} build must not copy the standalone Cloudflare helper`);
		assert.doesNotMatch(selection, /php8\.3-cloudflare/);
	}
	assert.equal(await fs.stat(output).then(() => true, () => false), false, 'The selection check must not create build assets');
});

test('Cloudflare repackaging validates old artifacts and preserves the compiled factory and Wasm bytes', async t => {
	const root = await temporary(t);
	const source = await packaged(path.join(root, 'old'));
	await editManifest(source, manifest => {
		manifest.schema = 1;
		delete manifest.packageName;
		manifest.files = manifest.files.filter(file => !cloudflarePackageFiles.includes(file.path));
	});
	await assert.rejects(verifyCloudflare(source, '8.3'), /Invalid Cloudflare manifest/);
	const original = await tree(source);
	const destination = path.join(root, 'standalone');
	await repackageCloudflare(source, destination, '8.3');
	assert.deepEqual(await tree(source), original, 'Migration must never change its source artifact');
	const {manifest} = await verifyCloudflare(destination, '8.3');
	assert.equal(manifest.provenance.repackagedFrom.schema, 1);
	for(const file of manifest.files.filter(file => file.path === manifest.runtime || file.path.endsWith('.wasm')))
		assert.equal(file.sha256, original[file.path], 'Native runtime/Wasm bytes must be reused exactly');
	const pkg = JSON.parse(await fs.readFile(path.join(destination, 'package.json'), 'utf8'));
	assert.equal(pkg.name, 'php-cloud-wasm');
	await repackageCloudflare(source, destination, '8.3');
	await assert.rejects(repackageCloudflare(source, source, '8.3'), /separate destination/);
	await fs.appendFile(path.join(source, manifest.runtime), '// stale native pair');
	const invalid = path.join(root, 'invalid');
	await assert.rejects(repackageCloudflare(source, invalid, '8.3'), /digest mismatch/);
	assert.equal(await fs.stat(invalid).then(() => true, () => false), false);
});

test('Cloudflare metadata must export only files present in the standalone artifact', async t => {
	const root = await packaged(await temporary(t));
	const metadata = path.join(root, 'package.json');
	const pkg = JSON.parse(await fs.readFile(metadata, 'utf8'));
	pkg.exports['./missing'] = './missing.mjs';
	await fs.writeFile(metadata, JSON.stringify(pkg));
	await refreshDigest(root, 'package.json');
	await assert.rejects(verifyCloudflare(root, '8.3'), /package export is missing/);
});

test('packed Cloudflare builder resolves source dependencies without a monorepo packages tree', async t => {
	const root = await temporary(t);
	const source = path.join(root, 'builder-source');
	await fs.mkdir(source);
	for(const name of ['package.json', '.npmignore', 'Makefile', 'php.mk', 'info.mak', 'ico.ans', 'compress-package.sh', 'emscripten-builder.dockerfile']) await fs.copyFile(path.join(repoRoot, name), path.join(source, name));
	for(const name of ['bin', 'source', 'patch', 'profiles']) await fs.cp(path.join(repoRoot, name), path.join(source, name), {recursive: true});
	await fs.mkdir(path.join(source, 'packages/not-shipped'), {recursive: true});
	await fs.writeFile(path.join(source, 'packages/not-shipped/sentinel'), 'must not ship');
	const packed = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root, '--cache', path.join(root, 'npm-cache')], {cwd: source, encoding: 'utf8'});
	assert.equal(packed.status, 0, packed.stderr);
	const metadata = JSON.parse(packed.stdout)[0];
	assert.ok(!metadata.files.some(file => file.path.startsWith('packages/')));
	for(const name of ['bin/build-cloudflare.mjs', 'bin/package-cloudflare.mjs', 'source/PhpCloudflare.mjs', 'profiles/cloudflare.mak']) assert.ok(metadata.files.some(file => file.path === name), name);

	const installed = path.join(root, 'project/node_modules/php-wasm-builder');
	await fs.mkdir(installed, {recursive: true});
	const extraction = spawnSync('tar', ['-xzf', path.join(root, metadata.filename), '-C', installed, '--strip-components=1'], {encoding: 'utf8'});
	assert.equal(extraction.status, 0, extraction.stderr);
	const packages = {'vrzno': 'vrzno', 'pdo-cfd1': 'pdo-cfd1', 'zlib': 'php-wasm-zlib', 'libzip': 'php-wasm-libzip', 'php-cloud-wasm': 'php-cloud-wasm', 'php-cgi-wasm': 'php-cgi-wasm', 'php-cli-wasm': 'php-cli-wasm', 'php-dbg-wasm': 'php-dbg-wasm'};
	for(const [folder, packageName] of Object.entries(packages))
	{
		const dependency = path.join(root, 'project/node_modules', packageName);
		await fs.mkdir(dependency);
		await fs.writeFile(path.join(dependency, 'package.json'), JSON.stringify({name: packageName, version: '0.0.0', exports: {'./package.json': './package.json'}}));
		// The published extension packages carry build source; runtime packages
		// carry declarations, but their pre/static makefiles are not published.
		if(['vrzno', 'pdo-cfd1', 'zlib', 'libzip'].includes(folder))
		{
			await fs.writeFile(path.join(dependency, 'static.mak'), `# ${packageName} fixture\n`);
		}
		if(folder === 'php-cloud-wasm')
		{
			for(const name of [...declarations, ...cloudflarePackageFiles]) await fs.copyFile(path.join(repoRoot, 'packages/php-cloud-wasm', name), path.join(dependency, name));
		}
		await fs.writeFile(path.join(dependency, '.env'), 'FIXTURE_SECRET=must-not-copy\n');
		await fs.writeFile(path.join(dependency, 'unneeded.wasm'), wasm);
	}
	const destination = path.join(root, 'snapshot');
	await snapshot(destination, installed);
	for(const folder of ['vrzno', 'pdo-cfd1', 'zlib', 'libzip'])
	{
		assert.match(await fs.readFile(path.join(destination, 'packages', folder, 'static.mak'), 'utf8'), /fixture/);
		assert.equal(await fs.stat(path.join(destination, 'packages', folder, '.env')).then(() => true, () => false), false);
		assert.equal(await fs.stat(path.join(destination, 'packages', folder, 'unneeded.wasm')).then(() => true, () => false), false);
	}
	assert.ok(await fs.stat(path.join(destination, 'packages/php-cloud-wasm/public.d.ts')));

	const bin = path.join(root, 'fake-bin');
	await fs.mkdir(bin);
	await fs.writeFile(path.join(bin, 'make'), `#!${process.execPath}\nconsole.log(process.argv.slice(2).join(' '));\n`, {mode: 0o755});
	const invocation = spawnSync(process.execPath, [path.join(installed, 'bin/php-wasm-builder.js'), 'build', 'cloudflare'], {cwd: path.join(root, 'project'), encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}});
	assert.equal(invocation.status, 0, invocation.stdout + invocation.stderr);
	assert.match(invocation.stdout, /cloudflare-mjs/);
});
