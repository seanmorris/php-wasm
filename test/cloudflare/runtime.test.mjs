import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { readArtifact } from './artifacts.mjs';

const version = process.env.PHP_VERSION ?? '8.4';
const root = process.env.CLOUDFLARE_ARTIFACT_ROOT ?? 'packages/php-cloud-wasm';
const artifact = readArtifact(root, version);
const timeout = 30_000;
let temporaryDirectory, miniflare;

// A deterministic deflated ZIP containing hello.txt and executable hello.php.
const archive = Buffer.from('UEsDBBQAAAAIAAAAAAA+67EKHQAAABsAAAAJAAAAaGVsbG8udHh0c87JL01Jy0ksSlVILErOyCxLVUjLrCgpLUrlAgBQSwMEFAAAAAgAAAAAAGkquDseAAAAHAAAAAkAAABoZWxsby5waHCzsS/IKFBITc7IV1B3DHL28AxzjQ/wCIj391a3BgBQSwECFAAUAAAACAAAAAAAPuuxCh0AAAAbAAAACQAAAAAAAAAAAAAAAAAAAAAAaGVsbG8udHh0UEsBAhQAFAAAAAgAAAAAAGkquDseAAAAHAAAAAkAAAAAAAAAAAAAAAAARAAAAGhlbGxvLnBocFBLBQYAAAAAAgACAG4AAACJAAAAAAA=', 'base64');

/**
 * Bounds operations which may otherwise hang after an Asyncify regression.
 * @param {Promise<unknown>} promise Pending engine operation.
 * @param {string} label Phase reported on timeout.
 * @returns {Promise<unknown>} Operation result.
 */
async function bounded(promise, label)
{
	let timer;
	try
	{
		return await Promise.race([
			promise
			, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeout}ms`)), timeout); })
		]);
	}
	finally
	{ clearTimeout(timer); }
}

before(async () => {
	const { Miniflare } = await import('miniflare');
	temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-cloudflare-test-'));
	const packageDirectory = path.join(temporaryDirectory, 'artifact');
	fs.mkdirSync(packageDirectory);
	for(const name of artifact.names)
	{
		fs.copyFileSync(path.join(artifact.directory, name), path.join(packageDirectory, name));
	}
	fs.copyFileSync(path.join(artifact.directory, artifact.manifestName), path.join(packageDirectory, artifact.manifestName));
	readArtifact(packageDirectory, version);
	fs.copyFileSync(new URL('./fixture-worker.mjs', import.meta.url), path.join(temporaryDirectory, 'fixture-worker.mjs'));
	const worker = `import { PhpCloudflare } from './artifact/${artifact.manifest.entrypoint}';
import factory from './artifact/${artifact.manifest.runtime}';
import wasm from './artifact/${artifact.wasm}';
import { createWorker } from './fixture-worker.mjs';
export default createWorker(PhpCloudflare, factory, wasm);
`;
	fs.writeFileSync(path.join(temporaryDirectory, 'worker.mjs'), worker);
	// Explicit modules avoid static traversal of Vrzno's unused import(name)
	// helper. Only the verified artifact inventory is available to the Worker.
	const modules = [
		{ type: 'ESModule', path: path.join(temporaryDirectory, 'worker.mjs') }
		, { type: 'ESModule', path: path.join(temporaryDirectory, 'fixture-worker.mjs') }
		, ...[...artifact.names].filter(name => /\.(?:mjs|wasm)$/.test(name)).map(name => ({
			type: name.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule'
			, path: path.join(packageDirectory, name)
		}))
	];
	miniflare = new Miniflare({
		modules
		, modulesRoot: temporaryDirectory
		, compatibilityDate: '2024-02-01'
		, compatibilityFlags: []
		, d1Databases: { DB: 'cloudflare-test-main', SECOND_DB: 'cloudflare-test-second' }
		, d1Persist: false
		, outboundService(request) {
			if(request.url === 'https://archive.fixture.invalid/example.zip')
			{
				return new Response(archive, { headers: { 'content-type': 'application/zip' } });
			}
			throw new Error(`Unexpected outbound fetch: ${request.method} ${request.url}`);
		}
	});
	await bounded(miniflare.ready, 'workerd startup');
	assert.deepEqual(await request('setup'), { setup: true });
}, { timeout: 60_000 });

after(async () => {
	try
	{
		if(miniflare) await bounded(miniflare.dispose(), 'workerd cleanup');
	}
	finally
	{
		if(temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
	}
});

/**
 * Calls one Worker fixture and includes its execution phase in any failure.
 * @param {string} name Fixture case name.
 * @param {object} options Optional request-local fixture parameters.
 * @returns {Promise<object>} Decoded Worker response.
 */
async function request(name, options = {})
{
	const response = await bounded(miniflare.dispatchFetch('https://worker.fixture.invalid/', {
		method: 'POST'
		, headers: { 'content-type': 'application/json' }
		, body: JSON.stringify({ case: name, ...options })
	}), name);
	const result = await bounded(response.json(), `${name} response`);
	assert.equal(response.status, 200, `${name}: ${JSON.stringify(result)}`);
	if('exit' in result) assert.equal(result.exit, 0, `${name}: ${JSON.stringify(result)}`);
	if('stderr' in result) assert.equal(result.stderr, '', `${name}: ${JSON.stringify(result)}`);
	return result;
}

test('strict engine policy rejects JS eval, Function and request-time Wasm byte compilation', { timeout }, async () => {
	assert.deepEqual(await request('engine-policy'), { eval: true, function: true, wasmBytes: true });
});

test('final static artifact initializes embedded PHP with its required extensions', { timeout }, async () => {
	const result = await request('baseline');
	assert.deepEqual(JSON.parse(result.stdout), [version, 'embed', true, true, true, true]);
	assert.ok(result.memoryBytes > 0 && result.memoryBytes <= 96 * 1024 * 1024);
});

test('Vrzno asynchronous calls, PHP callbacks and PHP eval work without JS eval', { timeout }, async () => {
	assert.deepEqual(JSON.parse((await request('bridge')).stdout), [42, 42, 42]);
});

test('original synchronous raw-exports instantiation hook preserves Asyncify rewind', { timeout }, async () => {
	assert.equal((await request('raw-exports-regression')).stdout.trim(), '42');
});

test('explicit Vrzno JS eval rejects and leaves the next async call usable', { timeout }, async () => {
	assert.equal(JSON.parse((await request('js-eval')).stdout).rejected, true);
	assert.equal((await request('recovery')).stdout, '42');
});

test('rejected asynchronous bridge calls can be caught before subsequent PHP work', { timeout }, async () => {
	const result = JSON.parse((await request('async-recovery')).stdout);
	assert.match(result[0], /fixture rejection/);
	assert.equal(result[1], 42);
});

test('overlapping operations on one PHP instance execute through its serial queue', { timeout }, async () => {
	const result = await request('queue');
	assert.deepEqual(result.results, ['AB', 'ABC', 0]);
	assert.equal(result.stdout, 'ABCD');
});

test('request-local instances do not share bindings, PHP state or filesystem state', { timeout }, async () => {
	for(const id of ['first', 'second'])
	{
		assert.deepEqual(JSON.parse((await request('isolation', { id })).stdout), [false, id, id]);
	}
	const results = await Promise.all(['parallel-a', 'parallel-b'].map(id => request('isolation', { id })));
	assert.deepEqual(results.map(result => JSON.parse(result.stdout)), [
		[false, 'parallel-a', 'parallel-a'], [false, 'parallel-b', 'parallel-b']
	]);
});

test('real local D1 supports positional CRUD, NULL/scalars, repeated execute and fetch modes', { timeout }, async () => {
	const result = JSON.parse((await request('d1-crud')).stdout);
	assert.deepEqual(result, [1, { name: 'alpha', amount: 7, optional: null }, [{ name: 'beta', amount: 2.5, optional: 'text' }], 1, 1]);
});

test('D1 database bindings remain local to each PHP constructor', { timeout }, async () => {
	assert.deepEqual(JSON.parse((await request('d1-binding')).stdout), { value: 'main' });
	assert.deepEqual(JSON.parse((await request('d1-binding', { database: 'second' })).stdout), { value: 'second' });
});

test('D1 numeric bindValue/bindParam preserve order, NULL, booleans and variable changes', { timeout }, async () => {
	assert.deepEqual(JSON.parse((await request('d1-parameters')).stdout), [
		{ first: 7, second: 'text', optional: null, flag: 1 }
		, { first: 9, second: 'text', optional: null, flag: 1 }
	]);
});

test('D1 silent errors, parameter-count errors and empty results recover in the same PHP instance', { timeout }, async () => {
	assert.deepEqual(JSON.parse((await request('d1-recovery')).stdout), [
		false
		, 'HY000'
		, { value: 42 }
		, false
		, 'HY093'
		// execute(array) defaults to PARAM_STR; explicit INT binding is tested above.
		, { value: '7' }
		, false
		, { value: 'main' }
	]);
});

test('D1 SQL errors and missing bindings report PDOException', { timeout }, async () => {
	for(const name of ['d1-errors', 'd1-missing'])
	{
		const result = JSON.parse((await request(name)).stdout);
		assert.equal(result.rejected, true);
		assert.ok(result.message.length > 0);
	}
});

test('unsupported D1 APIs fail explicitly instead of claiming success', { timeout }, async () => {
	assert.deepEqual(JSON.parse((await request('d1-unsupported')).stdout), [true, true, true, true, true]);
});

test('mocked archive fetch extracts and executes PHP, with static zip/zlib round-trips', { timeout }, async () => {
	assert.deepEqual(JSON.parse((await request('zip')).stdout), [
		...Array(3).fill('Cloudflare archive fixture\n')
		, 'ARCHIVE_PHP_OK', 'Cloudflare archive fixture\n'
	]);
});
