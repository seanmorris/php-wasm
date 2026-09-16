import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { stageCloudflarePages, PAGES_BUNDLE_LIMIT } from '../../bin/stage-cloudflare-pages.mjs';
import { artifactFixture, digest } from './fixtures.mjs';

test('Pages staging copies only the selected raw module inventory and attests compressed R2 downloads', async t => {
	const fixture = await artifactFixture(t);
	await fs.writeFile(path.join(fixture.artifactRoot, 'stale-other-version.wasm'), 'not selected');
	const result = await stageCloudflarePages(fixture.options);
	assert.equal(result.schema, 1);
	assert.equal(result.phpVersion, '8.5');
	assert.equal(result.buildId, 'fixture-build');
	assert.equal(result.phpManifestSha256, digest(await fs.readFile(fixture.manifestPath)));
	assert.equal(result.workerBundleSizeKind, 'conservative-upper-bound');
	assert.ok(result.workerBundleBytes > result.moduleBytes && result.workerBundleBytes < PAGES_BUNDLE_LIMIT);
	assert.equal(result.assets.length, 9);
	for(const asset of result.assets)
	{
		assert.ok(asset.path.startsWith('/fixture-build/php-cloud-wasm/'));
		assert.ok(asset.encodings.br && asset.encodings.gzip);
		assert.match(asset.sha256, /^[a-f0-9]{64}$/);
	}
	for(const file of result.files)
	{
		assert.equal(digest(await fs.readFile(path.join(fixture.options.outputDir, file.path))), file.sha256);
		assert.doesNotMatch(file.path, /\.br$|\.gz$|stale|\.d\.mts$/);
	}
	const workerDirectory = path.join(fixture.options.outputDir, 'dist/_worker.js');
	assert.match(await fs.readFile(path.join(workerDirectory, 'index.js'), 'utf8'), /from '\.\/php-cloud-wasm\/php8\.5-cloudflare\.mjs'/);
	assert.deepEqual(JSON.parse(await fs.readFile(path.join(fixture.options.outputDir, 'dist/_routes.json'), 'utf8')), {version: 1, include: ['/*'], exclude: []});
	const config = await fs.readFile(path.join(fixture.options.outputDir, 'wrangler.toml'), 'utf8');
	assert.match(config, /NIGHTLY_BUILDS/);
	assert.match(config, /bucket_name = 'php-wasm'/);
	assert.match(config, /NIGHTLY_PHP_DB/);
	assert.match(config, new RegExp(fixture.options.databaseId));
	assert.match(config, /cpu_ms = 1000/);
	assert.match(config, /compatibility_flags = \["enable_weak_ref"\]/);
	assert.match(config, /database_name = "php-wasm-nightly-demo"/);
	assert.deepEqual(JSON.parse(await fs.readFile(path.join(fixture.options.outputDir, 'stage.manifest.json'), 'utf8')), result);
});

test('Pages staging rejects invalid target choices before filesystem mutation', async t => {
	const {options} = await artifactFixture(t);
	for(const changes of [{databaseId: undefined}, {databaseId: 'invented'}, {buildId: '../escape'}, {buildId: 'bad/path'}, {phpVersion: '8.4'}, {outputDir: undefined}])
	{
		await assert.rejects(stageCloudflarePages({...options, ...changes}));
	}
	await assert.rejects(fs.access(options.outputDir));
});

test('Pages staging rejects corrupt raw bytes, stale compressed bytes and missing required sidecars', async t => {
	for(const scenario of ['raw', 'compressed', 'missing'])
	{
		const fixture = await artifactFixture(t);
		const name = path.join(fixture.artifactRoot, fixture.manifest.runtime);
		if(scenario === 'raw') await fs.appendFile(name, '// changed');
		if(scenario === 'compressed') await fs.writeFile(name + '.br', 'not brotli');
		if(scenario === 'missing') await fs.unlink(name + '.gz');
		await assert.rejects(stageCloudflarePages(fixture.options));
		await assert.rejects(fs.access(fixture.options.outputDir));
	}
});

test('Pages staging refuses linked sidecars and preserves an existing nonempty output', async t => {
	const fixture = await artifactFixture(t);
	await fs.mkdir(fixture.options.outputDir);
	const sentinel = path.join(fixture.options.outputDir, 'user-file');
	await fs.writeFile(sentinel, 'preserve me');
	await assert.rejects(stageCloudflarePages(fixture.options), /Output directory must be empty/);
	assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve me');
	const sidecar = path.join(fixture.artifactRoot, fixture.wasmName + '.br');
	await fs.unlink(sidecar);
	await fs.symlink(path.join(fixture.artifactRoot, fixture.wasmName + '.gz'), sidecar);
	await assert.rejects(stageCloudflarePages({...fixture.options, outputDir: path.join(fixture.root, 'other')}), /regular file/);
});

test('Pages staging enforces the 25 MiB nested multipart ceiling before writing output', async t => {
	const fixture = await artifactFixture(t);
	const bytes = Buffer.alloc(PAGES_BUNDLE_LIMIT, 32);
	const name = 'PhpBase.mjs';
	await fs.writeFile(path.join(fixture.artifactRoot, name), bytes);
	await fs.unlink(path.join(fixture.artifactRoot, name + '.br'));
	await fs.unlink(path.join(fixture.artifactRoot, name + '.gz'));
	Object.assign(fixture.manifest.files.find(file => file.path === name), {sha256: digest(bytes), bytes: bytes.length});
	await fs.writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
	await assert.rejects(stageCloudflarePages(fixture.options), /exceeds 25 MiB/);
	await assert.rejects(fs.access(fixture.options.outputDir));
});

test('Pages staging CLI fails closed on unknown or duplicate options', () => {
	for(const args of [['--unknown', 'value'], ['toString', 'value'], ['constructor', 'value'], ['--build-id', 'one', '--build-id', 'two'], ['--output-dir']])
	{
		const result = spawnSync(process.execPath, ['bin/stage-cloudflare-pages.mjs', ...args], {encoding: 'utf8'});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Invalid or duplicate staging option/);
	}
});
