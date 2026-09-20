import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { allowedSource, prepareBuildWorkspace, snapshot } from '../../bin/prepare-build-workspace.mjs';
import { cloudflarePackageFiles, packageCloudflare, repackageCloudflare, verifyCloudflare } from '../../bin/package-cloudflare.mjs';
import { mergeCloudflare } from '../../bin/merge-cloudflare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = data => createHash('sha256').update(data).digest('hex');
const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const helpers = ['PhpCloudflare.mjs', 'PhpBase.mjs', 'OutputBuffer.mjs', '_Event.mjs', 'fsOps.mjs', 'resolveDependencies.mjs'];
const declarations = ['PhpCloudflare.d.mts', 'PhpBase.d.mts', 'public.d.ts'];
const buildPackages = ['vrzno', 'pdo-cfd1', 'zlib', 'libzip', 'php-cloud-wasm'];
const buildRootFiles = ['Makefile', 'build-workspace.mak', 'php.mk', 'info.mak', 'ico.ans', 'compress-package.sh', 'emscripten-builder.dockerfile', 'docker-compose.yml', '.babelrc'];

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
	for(const name of buildRootFiles) await fs.writeFile(path.join(fixture, name), 'fixture source\n');
	await fs.copyFile(path.join(repoRoot, 'package.json'), path.join(fixture, 'package.json'));
	for(const name of ['source', 'patch', 'profiles', 'bin', '.github/bin', ...['vrzno', 'pdo-cfd1', 'zlib', 'libzip', 'php-cloud-wasm', 'php-cgi-wasm', 'php-cli-wasm', 'php-dbg-wasm'].map(name => `packages/${name}`)]) await fs.mkdir(path.join(fixture, name), {recursive: true});
	await fs.writeFile(path.join(fixture, 'source/probe.c'), 'int main(void) { return 0; }\n');
	await fs.writeFile(path.join(fixture, 'source/.env'), 'FIXTURE_SECRET=never-copy\n');
	await fs.writeFile(path.join(fixture, 'source/private.key'), 'fixture key, not a real credential\n');
	await fs.writeFile(path.join(fixture, 'packages/php-cloud-wasm/old.wasm'), wasm);
	const first = path.join(root, 'first');
	const firstHash = await snapshot(first, fixture, buildPackages);
	assert.match(firstHash, /^[a-f0-9]{64}$/);
	assert.deepEqual(await fs.readdir(path.join(first, 'source')), ['probe.c']);
	await fs.writeFile(path.join(fixture, 'source/.env'), 'FIXTURE_SECRET=changed\n');
	assert.equal(await snapshot(path.join(root, 'second'), fixture, buildPackages), firstHash);
	await fs.appendFile(path.join(fixture, 'source/probe.c'), '// changed source\n');
	assert.notEqual(await snapshot(path.join(root, 'third'), fixture, buildPackages), firstHash);
	await fs.symlink('../source/private.key', path.join(fixture, 'bin/linked.h'));
	await assert.rejects(snapshot(path.join(root, 'symlink'), fixture, buildPackages), /does not follow symlinks: bin\/linked.h/);
});

test('build workspace rejects invalid versions before filesystem work', async () => {
	await assert.rejects(prepareBuildWorkspace('/must-not-create', 'missing', '8.3; echo bad'), /Unsupported PHP version/);
});

test('build workspaces reuse native state, update wrappers, and separate changed configurations', async t => {
	const root = await temporary(t);
	const fixture = path.join(root, 'source');
	await snapshot(fixture, repoRoot, buildPackages);
	await fs.writeFile(path.join(fixture, 'source/obsolete.mjs'), '// old helper\n');
	const cache = path.join(root, 'cache');
	const prepare = (version = '8.3', settings = '') => prepareBuildWorkspace(cache, 'profiles/cloudflare.mak', version, settings, buildPackages, fixture);
	const first = await prepare();
	const downloadHelper = '.github/bin/retry-download.sh';
	assert.equal(await fs.readFile(path.join(first, downloadHelper), 'utf8'), await fs.readFile(path.join(repoRoot, downloadHelper), 'utf8'));
	assert.ok((await fs.stat(path.join(first, downloadHelper))).mode & 0o111);
	const object = path.join(first, '.cache/native.o');
	await fs.writeFile(object, 'compiled fixture');
	const before = (await fs.stat(object)).mtimeMs;
	const configurationMtime = (await fs.stat(path.join(first, '.build-env.mak'))).mtimeMs;
	assert.equal(await prepare(), first);
	assert.equal((await fs.stat(path.join(first, '.build-env.mak'))).mtimeMs, configurationMtime);
	await fs.appendFile(path.join(fixture, 'source/PhpCloudflare.mjs'), '\n// wrapper-only update\n');
	await fs.rm(path.join(fixture, 'source/obsolete.mjs'));
	assert.equal(await prepare(), first);
	assert.match(await fs.readFile(path.join(first, 'source/PhpCloudflare.mjs'), 'utf8'), /wrapper-only update/);
	assert.equal(await fs.stat(path.join(first, 'source/obsolete.mjs')).then(() => true, () => false), false);
	assert.equal((await fs.stat(object)).mtimeMs, before);
	assert.notEqual(await prepare('8.5'), first);
	assert.notEqual(await prepare('8.3', 'INITIAL_MEMORY=48MB'), first);
	await fs.appendFile(path.join(fixture, 'profiles/cloudflare.mak'), '\nINITIAL_MEMORY=48MB\n');
	const changed = await prepare();
	assert.notEqual(changed, first);
	assert.equal(await fs.stat(path.join(changed, '.cache/native.o')).then(() => true, () => false), false);
	assert.equal(await fs.readFile(object, 'utf8'), 'compiled fixture');
	const originalTag = process.env.ZLIB_TAG;
	try
	{
		process.env.ZLIB_TAG = 'fixture-other-upstream-version';
		assert.notEqual(await prepare(), changed, 'Environment-selected dependency refs require separate native state');
	}
	finally
	{
		if(originalTag === undefined) delete process.env.ZLIB_TAG;
		else process.env.ZLIB_TAG = originalTag;
	}
});

test('real Make workspace dispatch preserves overrides, isolates files, and propagates failure', async t => {
	const root = await temporary(t);
	const fixture = path.join(root, 'source');
	await snapshot(fixture, repoRoot, buildPackages);
	const makefile = path.join(fixture, 'Makefile');
	const probe = `PROBE_EXIT ?= 0\n.PHONY: workspace-probe\nworkspace-probe:\n\t@node -e 'require("fs").writeFileSync("probe.json", JSON.stringify({cwd:process.cwd(), initial:"\${INITIAL_MEMORY}", maximum:"\${MAXIMUM_MEMORY}"}));require("fs").appendFileSync(process.env.BUILD_TEST_TRACE,"native\\n");process.exit(\${PROBE_EXIT})'\n`;
	const local = `workspace-local: workspace-probe\n\t@node -e 'require("fs").appendFileSync(process.env.BUILD_TEST_TRACE,"local\\n")'\n`;
	await fs.writeFile(makefile, (await fs.readFile(makefile, 'utf8')).replace('endif # BUILD_WORKSPACE', `${probe}\nendif # BUILD_WORKSPACE`).replace('# Optional source workspaces', `${local}\n# Optional source workspaces`));
	await fs.writeFile(path.join(fixture, 'fixture.mak'), 'include profiles/cloudflare.mak\nINITIAL_MEMORY=48MB\nBUILD_WORKSPACE_TARGETS=workspace-probe\n');
	await fs.mkdir(path.join(fixture, 'third_party'));
	await fs.writeFile(path.join(fixture, 'third_party/sentinel'), 'caller native state');
	const bin = path.join(root, 'bin');
	await fs.mkdir(bin);
	await fs.writeFile(path.join(bin, 'docker'), `#!${process.execPath}\nif(process.argv[2] !== 'image' || process.argv[3] !== 'inspect') process.exit(9);\nconsole.log('sha256:${'a'.repeat(64)}');\n`, {mode: 0o755});
	const cache = path.join(root, "consumer's project", 'build');
	const args = ['--no-print-directory', 'workspace-probe', 'ENV_FILE=fixture.mak', 'PHP_VERSION=8.3', `BUILD_WORKSPACE=${cache}`, 'MAXIMUM_MEMORY=80MB', 'MAKEFLAGS='];
	const trace = path.join(root, 'trace');
	const options = {cwd: fixture, encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, BUILD_TEST_TRACE: trace, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}};
	const result = spawnSync('make', args, options);
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const workspace = result.stdout.match(/Build workspace: (.+)/)?.[1];
	assert.ok(workspace?.startsWith(cache), result.stdout);
	assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'probe.json'), 'utf8')), {cwd: workspace, initial: '48MB', maximum: '80MB'});
	assert.equal(await fs.stat(path.join(fixture, 'probe.json')).then(() => true, () => false), false);
	assert.equal(await fs.stat(path.join(workspace, 'third_party/sentinel')).then(() => true, () => false), false);
	assert.equal(await fs.readFile(path.join(fixture, 'third_party/sentinel'), 'utf8'), 'caller native state');
	await fs.writeFile(trace, '');
	const together = spawnSync('make', [...args, 'workspace-local', '-j2'], options);
	assert.equal(together.status, 0, together.stdout + together.stderr);
	assert.equal(await fs.readFile(trace, 'utf8'), 'native\nlocal\n');
	const failed = spawnSync('make', [...args, 'PROBE_EXIT=7'], options);
	assert.notEqual(failed.status, 0);
	assert.match(failed.stderr, /Error 7/);
	const dryCache = path.join(root, 'dry-run');
	const dry = spawnSync('make', [...args, '--dry-run', `BUILD_WORKSPACE=${dryCache}`], options);
	assert.equal(dry.status, 0, dry.stdout + dry.stderr);
	assert.equal(await fs.stat(dryCache).then(() => true, () => false), false);
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

test('Make packaging preserves raw outputs and existing packages when validation fails', async t => {
	const root = await temporary(t);
	const raw = await stage(path.join(root, 'raw'));
	const output = path.join(root, 'final package');
	for(const directory of ['php8.3-src', 'zlib', 'libzip'])
	{
		const git = path.join(root, 'third_party', directory, '.git');
		await fs.mkdir(git, {recursive: true});
		await fs.writeFile(path.join(git, 'HEAD'), `${'a'.repeat(40)}\n`);
	}
	for(const name of ['vrzno', 'pdo-cfd1'])
	{
		const directory = path.join(root, 'third_party', name);
		await fs.mkdir(directory);
		await fs.writeFile(path.join(directory, '.php-wasm-source.json'), JSON.stringify({identity: {commit: 'b'.repeat(40)}}));
	}
	const buildInfo = {sourceSha256: 'c'.repeat(64), builderImage: `sha256:${'d'.repeat(64)}`};
	await fs.writeFile(path.join(root, '.build-info.json'), JSON.stringify(buildInfo));
	const args = [path.join(repoRoot, 'bin/package-cloudflare.mjs'), '--build', raw, '8.3', output];
	const options = {cwd: root, encoding: 'utf8', env: {...process.env, INITIAL_MEMORY: '48MB', MAXIMUM_MEMORY: '80MB'}};
	const before = await tree(raw);
	const runtimeMtime = (await fs.stat(path.join(raw, 'php8.3-cloudflare-runtime.mjs'))).mtimeMs;
	for(let iteration = 0; iteration < 2; iteration++)
	{
		const packaged = spawnSync(process.execPath, args, options);
		assert.equal(packaged.status, 0, packaged.stdout + packaged.stderr);
		assert.deepEqual(await tree(raw), before);
		assert.equal((await fs.stat(path.join(raw, 'php8.3-cloudflare-runtime.mjs'))).mtimeMs, runtimeMtime);
	}
	const {manifest} = await verifyCloudflare(output, '8.3');
	assert.equal(manifest.provenance.initialMemory, 48 * 1024 ** 2);
	assert.equal(manifest.provenance.maximumMemory, 80 * 1024 ** 2);
	assert.equal(manifest.provenance.sourceSha256, buildInfo.sourceSha256);
	assert.equal(manifest.provenance.builderImage, buildInfo.builderImage);
	const previous = await tree(output);
	await fs.writeFile(path.join(raw, 'php8.3-cloudflare-runtime.mjs.wasm'), 'broken wasm');
	const failed = spawnSync(process.execPath, args, options);
	assert.notEqual(failed.status, 0);
	assert.match(failed.stderr, /Invalid Cloudflare WebAssembly/);
	assert.deepEqual(await tree(output), previous);
	const sameDirectory = spawnSync(process.execPath, [...args.slice(0, -1), raw], options);
	assert.notEqual(sameDirectory.status, 0);
	assert.match(sameDirectory.stderr, /separate raw and final directories/);
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

test('Cloudflare selects the requested configuration and normal Make recipes', async t => {
	const root = await temporary(t);
	const fixtureConfig = path.join(root, 'fixture-settings.mak');
	await fs.writeFile(fixtureConfig, 'include profiles/cloudflare.mak\nINITIAL_MEMORY=48MB\n');
	const result = spawnSync('make', ['--no-print-directory', '--dry-run', 'cloudflare-mjs', 'PHP_VERSION=8.3', `ENV_FILE=${fixtureConfig}`, 'BUILD_WORKSPACE=', 'MAKE=true', 'MAXIMUM_MEMORY=80MB'], {cwd: repoRoot, encoding: 'utf8', env: {...process.env, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /docker compose .* emcc --version/);
	assert.match(result.stdout, /INITIAL_MEMORY='48MB' MAXIMUM_MEMORY='80MB' node bin\/package-cloudflare.mjs --build/);
	assert.doesNotMatch(result.stdout, /build-cloudflare|cloudflare-container-run|docker create/);
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

test('Cloudflare CLI defaults to ESM and passes the caller configuration to Make', async t => {
	const root = await temporary(t);
	const bin = path.join(root, 'bin');
	const log = path.join(root, 'make-arguments.json');
	await fs.mkdir(bin);
	await fs.writeFile(path.join(root, '.php-wasm-rc'), 'include profiles/cloudflare.mak\n');
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
	assert.ok(args.includes(`ENV_FILE=${path.join(root, '.php-wasm-rc')}`));
	assert.ok(args.includes(`CLOUDFLARE_OUTPUT_DIR=${path.join(root, 'packages/php-cloud-wasm')}`));
	assert.ok(args.includes(`BUILD_WORKSPACE=${path.join(root, '.cache/build')}`));
	assert.ok(!args.some(arg => /^(?:PHP_BUILDER_DIR|ENV_DIR)=/.test(arg)));
});

test('Cloudflare CLI preserves paths and selected configuration in a Make dry run', async t => {
	const root = await temporary(t);
	const consumer = path.join(root, "consumer's project");
	const bin = path.join(root, 'bin');
	await fs.mkdir(consumer);
	await fs.mkdir(bin);
	await fs.writeFile(path.join(consumer, '.php-wasm-rc'), 'include profiles/cloudflare.mak\n');
	const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/php-wasm-builder.js'), 'build', 'cloudflare'], {
		cwd: consumer
		, encoding: 'utf8'
		, env: {...process.env, MAKEFLAGS: 'n', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /prepare-build-workspace.mjs/);
	assert.match(result.stdout, /consumer.*s project\/\.cache\/build/);
	assert.match(result.stdout, /consumer.*s project\/\.php-wasm-rc/);
	assert.equal(await fs.stat(path.join(consumer, '.cache')).then(() => true, () => false), false);
	assert.doesNotMatch(result.stderr, /overriding recipe|mixed implicit and normal rules/);
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
	const defaultBuild = spawnSync('make', ['--no-print-directory', '--dry-run', 'MAKE=true', 'ENV_FILE=/dev/null', 'EXTENSION_PACKAGE_DIRS='], {
		cwd: repoRoot, encoding: 'utf8'
		, env: {...process.env, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', GNUMAKEFLAGS: ''}
	});
	assert.equal(defaultBuild.status, 0, defaultBuild.stdout + defaultBuild.stderr);
	assert.match(defaultBuild.stdout, /true _all/);
	assert.doesNotMatch(defaultBuild.stdout, /test\/cloudflare/);
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
	for(const name of ['package.json', '.npmignore', ...buildRootFiles]) await fs.copyFile(path.join(repoRoot, name), path.join(source, name));
	for(const name of ['bin', 'source', 'patch', 'profiles', '.github/bin']) await fs.cp(path.join(repoRoot, name), path.join(source, name), {recursive: true});
	await fs.mkdir(path.join(source, 'packages/not-shipped'), {recursive: true});
	await fs.writeFile(path.join(source, 'packages/not-shipped/sentinel'), 'must not ship');
	const packed = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root, '--cache', path.join(root, 'npm-cache')], {cwd: source, encoding: 'utf8'});
	assert.equal(packed.status, 0, packed.stderr);
	const metadata = JSON.parse(packed.stdout)[0];
	assert.ok(!metadata.files.some(file => file.path.startsWith('packages/')));
	for(const name of ['build-workspace.mak', 'bin/prepare-build-workspace.mjs', 'bin/package-cloudflare.mjs', 'bin/source-importer.mjs', 'source/PhpCloudflare.mjs', 'profiles/cloudflare.mak', '.github/bin/retry-download.sh']) assert.ok(metadata.files.some(file => file.path === name), name);

	const installed = path.join(root, 'project/node_modules/php-wasm-builder');
	await fs.mkdir(installed, {recursive: true});
	const extraction = spawnSync('tar', ['-xzf', path.join(root, metadata.filename), '-C', installed, '--strip-components=1'], {encoding: 'utf8'});
	assert.equal(extraction.status, 0, extraction.stderr);
	// Published dependencies may use versions instead of checkout-relative paths.
	const installedMetadata = JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8'));
	for(const [name, value] of Object.entries(installedMetadata.dependencies))
		if(value.startsWith('./packages/')) installedMetadata.dependencies[name] = '0.0.0';
	await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify(installedMetadata));
	const packages = {'vrzno': 'vrzno', 'pdo-cfd1': 'pdo-cfd1', 'zlib': 'php-wasm-zlib', 'libzip': 'php-wasm-libzip', 'php-cloud-wasm': 'php-cloud-wasm', 'php-cgi-wasm': 'php-cgi-wasm', 'php-cli-wasm': 'php-cli-wasm', 'php-dbg-wasm': 'php-dbg-wasm'};
	for(const [folder, packageName] of Object.entries(packages))
	{
		const dependency = path.join(root, 'project/node_modules', packageName);
		await fs.mkdir(dependency);
		if(['vrzno', 'pdo-cfd1'].includes(folder))
		{
			const packedDependency = spawnSync('npm', ['pack', '--json', '--ignore-scripts', path.join(repoRoot, 'packages', folder), '--pack-destination', root, '--cache', path.join(root, 'npm-cache')], {cwd: root, encoding: 'utf8'});
			assert.equal(packedDependency.status, 0, packedDependency.stderr);
			const filename = JSON.parse(packedDependency.stdout)[0].filename;
			const extractedDependency = spawnSync('tar', ['-xzf', path.join(root, filename), '-C', dependency, '--strip-components=1'], {encoding: 'utf8'});
			assert.equal(extractedDependency.status, 0, extractedDependency.stderr);
		}
		else await fs.writeFile(path.join(dependency, 'package.json'), JSON.stringify({name: packageName, version: '0.0.0', exports: {'./package.json': './package.json'}}));
		// The published extension packages carry build source; runtime packages
		// carry declarations, but their pre/static makefiles are not published.
		if(['zlib', 'libzip'].includes(folder))
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
	await snapshot(destination, installed, buildPackages);
	for(const folder of ['vrzno', 'pdo-cfd1', 'zlib', 'libzip'])
	{
		const makefile = await fs.readFile(path.join(destination, 'packages', folder, 'static.mak'), 'utf8');
		if(['vrzno', 'pdo-cfd1'].includes(folder)) assert.equal(makefile, await fs.readFile(path.join(repoRoot, 'packages', folder, 'static.mak'), 'utf8'));
		else assert.match(makefile, /fixture/);
		assert.equal(await fs.stat(path.join(destination, 'packages', folder, '.env')).then(() => true, () => false), false);
		assert.equal(await fs.stat(path.join(destination, 'packages', folder, 'unneeded.wasm')).then(() => true, () => false), false);
	}
	assert.ok(await fs.stat(path.join(destination, 'packages/php-cloud-wasm/public.d.ts')));
	assert.equal(await fs.readFile(path.join(destination, 'bin/source-importer.mjs'), 'utf8'), await fs.readFile(path.join(installed, 'bin/source-importer.mjs'), 'utf8'));
	// Execute the package callers from the installed builder and its isolated
	// snapshot. Both layouts use the builder's single shared implementation.
	for(const [folder, extension] of [['vrzno', 'vrzno'], ['pdo-cfd1', 'pdo_cfd1']])
	{
		const repository = path.join(root, `${folder}-upstream`);
		await fs.mkdir(repository);
		await fs.writeFile(path.join(repository, `${extension}.c`), '/* snapshot fixture */\n');
		await fs.writeFile(path.join(repository, 'config.m4'), 'dnl snapshot fixture\n');
		for(const args of [['init', '--quiet'], ['add', '.'], ['-c', 'user.name=Snapshot test', '-c', 'user.email=snapshot@example.invalid', 'commit', '--quiet', '-m', 'fixture']])
		{
			const result = spawnSync('git', args, {cwd: repository, encoding: 'utf8'});
			assert.equal(result.status, 0, result.stderr);
		}
		const revision = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'});
		assert.equal(revision.status, 0, revision.stderr);
		for(const [cwd, helper] of [
			[installed, path.join(root, 'project/node_modules', folder, 'import-source.mjs')]
			, [destination, path.join(destination, 'packages', folder, 'import-source.mjs')]
		]) {
			for(const args of [['stage', repository, revision.stdout.trim()], ['sync', '8.3']])
			{
				const result = spawnSync(process.execPath, [helper, ...args], {cwd, encoding: 'utf8'});
				assert.equal(result.status, 0, result.stderr);
			}
			const imported = path.join(cwd, 'third_party/php8.3-src/ext', extension);
			assert.equal(await fs.readFile(path.join(imported, `${extension}.c`), 'utf8'), '/* snapshot fixture */\n');
			const state = JSON.parse(await fs.readFile(path.join(imported, '.php-wasm-source.json'), 'utf8'));
			assert.equal(state.identity.commit, revision.stdout.trim());
		}
	}

	const bin = path.join(root, 'fake-bin');
	await fs.mkdir(bin);
	await fs.writeFile(path.join(bin, 'make'), `#!${process.execPath}\nconsole.log(process.argv.slice(2).join(' '));\n`, {mode: 0o755});
	const invocation = spawnSync(process.execPath, [path.join(installed, 'bin/php-wasm-builder.js'), 'build', 'cloudflare'], {cwd: path.join(root, 'project'), encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}});
	assert.equal(invocation.status, 0, invocation.stdout + invocation.stderr);
	assert.match(invocation.stdout, /cloudflare-mjs/);
});
