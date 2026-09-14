// Explicit post-build test: consumes the actual staged Pages modules unchanged.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const stageRoot = path.resolve(process.env.CLOUDFLARE_PAGES_PROJECT_DIR ?? '.cache/nightly-pages');
const artifactRoot = path.resolve(process.env.CLOUDFLARE_ARTIFACT_ROOT ?? 'packages/php-cloud-wasm');
const stage = JSON.parse(await fs.readFile(path.join(stageRoot, 'stage.manifest.json'), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const canary = 'fixture-only-env-must-not-appear-in-phpinfo-7492';
let miniflare, directory, base;

/**
 * Reads raw HTTP bytes without fetch's transparent decompression.
 * @param {URL} url Local workerd URL.
 * @param {object} options HTTP options.
 * @param {Buffer} body Optional request bytes.
 * @returns {Promise<object>} Status, headers and unchanged response bytes.
 */
function rawRequest(url, options = {}, body)
{
	return new Promise((resolve, reject) => {
		// Early rejection of an unread POST body closes workerd's HTTP/1 socket.
		// Avoid Node's keepalive reuse race between independent fixture requests.
		const request = http.request(url, {...options, agent: false}, response => {
			const chunks = [];
			response.on('data', chunk => chunks.push(chunk));
			response.on('error', reject);
			response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks)}));
		});
		request.setTimeout(30_000, () => request.destroy(new Error('Local Pages request timed out')));
		request.on('error', error => reject(new Error(`${options.method ?? 'GET'} ${url.pathname}: ${error.message}`, {cause: error})));
		request.end(body);
	});
}

before(async () => {
	assert.equal(stage.schema, 1);
	assert.equal(stage.phpVersion, '8.5');
	for(const file of stage.files)
	{
		assert.equal(digest(await fs.readFile(path.join(stageRoot, file.path))), file.sha256, file.path);
	}
	const modules = stage.files.filter(file => file.path.startsWith('dist/_worker.js/')).map(file => ({
		type: file.path.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule'
		, path: path.join(stageRoot, file.path)
	}));
	modules.sort((a, b) => Number(b.path.endsWith('/index.js')) - Number(a.path.endsWith('/index.js')));
	directory = await fs.mkdtemp(path.join(os.tmpdir(), 'php-pages-live-test-'));
	const r2Buckets = {NIGHTLY_BUILDS: 'nightly-pages-integration'};
	miniflare = new Miniflare({
		rootPath: directory
		, d1Persist: false
		, r2Persist: false
		, workers: [
			{
				name: 'nightly'
				, modules
				, modulesRoot: path.join(stageRoot, 'dist/_worker.js')
				, compatibilityDate: '2024-12-01', compatibilityFlags: [], r2Buckets
				, d1Databases: {NIGHTLY_PHP_DB: 'nightly-pages-d1'}
				, bindings: {LEAK_CANARY: canary}
				, outboundService() { throw new Error('Unexpected Pages demo outbound fetch'); }
			}
			, {
				name: 'seed', modules: true, compatibilityDate: '2024-12-01', r2Buckets
				, unsafeDirectSockets: [{host: '127.0.0.1', port: 0}]
				, script: `export default {async fetch(request, env) {
					await env.NIGHTLY_BUILDS.put(new URL(request.url).searchParams.get('key'), await request.arrayBuffer());
					return new Response('seeded');
				}};`
			}
		]
	});
	base = await miniflare.ready;
	const seed = await miniflare.unsafeGetDirectURL('seed');
	for(const asset of stage.assets)
	{
		for(const suffix of ['', '.br', '.gz'])
		{
			if(suffix === '.br' && !asset.encodings.br || suffix === '.gz' && !asset.encodings.gzip) continue;
			const bytes = await fs.readFile(path.join(artifactRoot, path.basename(asset.path) + suffix));
			const expected = suffix === '' ? asset : asset.encodings[suffix === '.br' ? 'br' : 'gzip'];
			assert.equal(digest(bytes), expected.sha256);
			const url = new URL(seed);
			url.searchParams.set('key', asset.path.slice(1) + suffix);
			assert.equal((await rawRequest(url, {method: 'PUT'}, bytes)).status, 200);
		}
	}
}, {timeout: 90_000});

after(async () => {
	try
{ if(miniflare) await miniflare.dispose(); }
	finally
{ if(directory) await fs.rm(directory, {recursive: true, force: true}); }
});

test('staged Pages entry runs actual PHP and typed PDO queries against local D1', {timeout: 30_000}, async () => {
	for(const pathname of ['/php/health', '/php/d1'])
	{
		const response = await rawRequest(new URL(pathname, base));
		assert.equal(response.status, 200, response.body.toString());
		const result = JSON.parse(response.body);
		assert.deepEqual({...result, phpFullVersion: undefined}, {
			ok: true
			, buildId: stage.buildId
			, phpVersion: '8.5'
			, phpFullVersion: undefined
			, sapi: 'embed'
			, driver: 'cfd1'
			, d1: {answer: 42}
		});
		assert.match(result.phpFullVersion, /^8\.5\./);
		assert.equal(response.headers['cache-control'], 'no-store');
	}
});

test('fixed PHP demo and restricted phpinfo render without exposing bindings or request variables', {timeout: 30_000}, async () => {
	const page = await rawRequest(new URL('/php/', base));
	assert.equal(page.status, 200, page.body.toString());
	assert.match(page.body.toString(), /This page is generated by PHP 8\.5\./);
	assert.ok(page.body.toString().includes(`/${stage.buildId}/php-cloud-wasm/`));
	const information = await rawRequest(new URL('/php/phpinfo?LEAK_CANARY=request-value-must-not-appear', base));
	assert.equal(information.status, 200, information.body.toString());
	assert.match(information.body.toString(), /PHP Version|PHP version/i);
	assert.doesNotMatch(information.body.toString(), /fixture-only-env-must-not-appear|request-value-must-not-appear|LEAK_CANARY|PHP Variables|<h2>Environment<\/h2>/i);
	assert.ok(information.body.length < 256 * 1024);
	assert.match(information.headers['content-security-policy'], /default-src 'none'/);
});

test('actual staged R2 delivery preserves raw identity/Brotli/gzip digests and HEAD semantics', {timeout: 60_000}, async () => {
	for(const asset of stage.assets.filter(asset => asset.path.endsWith('.wasm') || asset.path.endsWith('-runtime.mjs')))
	{
		for(const encoding of ['identity', 'br', 'gzip'])
		{
			const headers = {'Accept-Encoding': encoding};
			const response = await rawRequest(new URL(asset.path, base), {headers});
			assert.equal(response.status, 200);
			assert.equal(response.headers['content-encoding'], encoding === 'identity' ? undefined : encoding);
			assert.equal(response.headers.vary, 'Accept-Encoding');
			assert.equal(response.headers['access-control-allow-origin'], '*');
			assert.equal(response.headers['content-type'], asset.path.endsWith('.wasm') ? 'application/wasm' : 'application/javascript');
			const expected = encoding === 'identity' ? asset : asset.encodings[encoding];
			assert.equal(digest(response.body), expected.sha256);
			const decoded = encoding === 'br' ? brotliDecompressSync(response.body) : encoding === 'gzip' ? gunzipSync(response.body) : response.body;
			assert.equal(digest(decoded), asset.sha256);
			const head = await rawRequest(new URL(asset.path, base), {method: 'HEAD', headers});
			assert.equal(head.status, 200);
			assert.equal(head.body.length, 0);
			assert.equal(head.headers['content-encoding'], response.headers['content-encoding']);
				assert.equal(Number(head.headers['content-length']), expected.bytes, `${asset.path} ${encoding}: ${JSON.stringify(head.headers)}`);
		}
	}
});

test('staged handler rejects request-supplied PHP and SQL with no public write endpoint', {timeout: 30_000}, async () => {
	assert.equal((await rawRequest(new URL('/php/d1', base), {method: 'POST'}, Buffer.from('DROP TABLE anything'))).status, 405);
	assert.equal((await rawRequest(new URL('/php/run', base))).status, 404);
	const response = await rawRequest(new URL('/php/d1?sql=DROP&code=echo%20arbitrary', base));
	assert.equal(response.status, 200);
	assert.equal(JSON.parse(response.body).d1.answer, 42);
});

test('pinned Wrangler Pages development facade executes PHP with explicit local bindings', {timeout: 90_000}, async () => {
	const wranglerPath = path.join(path.dirname(fileURLToPath(import.meta.resolve('wrangler/package.json'))), 'bin/wrangler.js');
	const args = [
		wranglerPath
		, 'pages'
		, 'dev'
		, 'dist'
		, '--env-file'
		, '/dev/null'
		, '--ip'
		, '127.0.0.1'
		, '--port'
		, '0'
		, '--inspector-port'
		, '0'
		, '--persist-to'
		, path.join(directory, 'wrangler-state')
		, '--d1'
		, 'NIGHTLY_PHP_DB'
		, '--r2'
		, 'NIGHTLY_BUILDS'
		, '--experimental-provision=false'
		, '--experimental-auto-create=false'
	];
	const child = spawn(process.execPath, args, {
		cwd: stageRoot
		, env: {PATH: process.env.PATH, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, 'wrangler-logs')}
		, stdio: ['ignore', 'pipe', 'pipe']
		, detached: process.platform !== 'win32'
	});
	let log = '', timer;
	const closed = once(child, 'close');
	try
	{
		const url = await new Promise((resolve, reject) => {
			const collect = bytes => {
				log = (log + bytes.toString()).slice(-12_000);
				const match = /Ready on (http:\/\/127\.0\.0\.1:\d+)/.exec(log);
				if(match) resolve(new URL(match[1]));
			};
			child.stdout.on('data', collect);
			child.stderr.on('data', collect);
			child.on('error', reject);
			child.on('exit', code => reject(new Error(`Wrangler exited ${code}: ${log}`)));
			timer = setTimeout(() => reject(new Error(`Wrangler startup timeout: ${log}`)), 60_000);
		});
		clearTimeout(timer);
		const response = await rawRequest(new URL('/php/health', url));
		assert.equal(response.status, 200, `${response.body}\n${log}`);
		assert.deepEqual(JSON.parse(response.body).d1, {answer: 42});
		assert.equal(JSON.parse(response.body).buildId, stage.buildId);
		assert.doesNotMatch(log, /remote mode|deploying your|provisioned/i);
	}
	finally
	{
		clearTimeout(timer);
		const signal = value => {
			try
			{
				if(process.platform === 'win32') child.kill(value);
				else process.kill(-child.pid, value);
			}
			catch(error)
			{
				if(error.code !== 'ESRCH') throw error;
			}
		};
		signal('SIGTERM');
		const force = setTimeout(() => signal('SIGKILL'), 5_000);
		await closed;
		clearTimeout(force);
	}
	for(const file of stage.files)
		assert.equal(digest(await fs.readFile(path.join(stageRoot, file.path))), file.sha256, `Wrangler mutated staged ${file.path}`);
});

test('pinned Wrangler offline multipart includes configured bindings and unchanged raw PHP modules', {timeout: 60_000}, async () => {
	const wranglerPath = path.join(path.dirname(fileURLToPath(import.meta.resolve('wrangler/package.json'))), 'bin/wrangler.js');
	const bundlePath = path.join(directory, 'worker.bundle');
	const metadataPath = path.join(directory, 'build.json');
	const args = [
		wranglerPath
		, 'pages'
		, 'functions'
		, 'build'
		, '--project-directory'
		, stageRoot
		, '--build-output-directory'
		, path.join(stageRoot, 'dist')
		, '--outfile'
		, bundlePath
		, '--build-metadata-path'
		, metadataPath
		, '--env-file'
		, '/dev/null'
	];
	await promisify(execFile)(process.execPath, args, {
		cwd: stageRoot
		, env: {PATH: process.env.PATH, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, 'wrangler-logs')}
		, timeout: 45_000
		, maxBuffer: 1024 * 1024
	});
	const bytes = await fs.readFile(bundlePath);
	assert.ok(bytes.length < 25 * 1024 * 1024, 'Actual Pages multipart must fit the upload limit');
	assert.ok(bytes.length <= stage.workerBundleBytes, 'Staging must conservatively bound the actual multipart');
	const firstLine = bytes.subarray(0, bytes.indexOf('\r\n')).toString('utf8');
	assert.match(firstLine, /^--[A-Za-z0-9-]+$/);
	const parts = await new Response(bytes, {headers: {'Content-Type': `multipart/form-data; boundary=${firstLine.slice(2)}`}}).formData();
	const rawMetadata = parts.get('metadata');
	assert.ok(rawMetadata, 'Worker multipart needs upload metadata');
	const metadata = JSON.parse(typeof rawMetadata === 'string' ? rawMetadata : await rawMetadata.text());
	const configuration = await fs.readFile(path.join(stageRoot, 'wrangler.toml'), 'utf8');
	const databaseId = /^database_id\s*=\s*"([a-f0-9-]+)"/m.exec(configuration)?.[1];
	const compatibilityDate = /^compatibility_date\s*=\s*"([0-9-]+)"/m.exec(configuration)?.[1];
	assert.ok(databaseId && compatibilityDate, 'The tested stage must explicitly configure D1 and compatibility date');
	assert.equal(metadata.bindings.find(binding => binding.type === 'd1' && binding.name === 'NIGHTLY_PHP_DB')?.id, databaseId);
	assert.equal(metadata.bindings.find(binding => binding.type === 'r2_bucket' && binding.name === 'NIGHTLY_BUILDS')?.bucket_name, 'php-wasm');
	assert.equal(metadata.limits?.cpu_ms, 1000);
	assert.equal(metadata.compatibility_date, compatibilityDate);
	assert.ok(parts.has(metadata.main_module), 'Upload metadata must reference the emitted entrypoint');
	assert.equal(stage.assets.length, 9, 'Exactly one version and its raw runtime closure are tested');
	for(const asset of stage.assets)
	{
		const name = `php-cloud-wasm/${path.basename(asset.path)}`;
		const part = parts.get(name);
		assert.ok(part && typeof part !== 'string', `Missing raw multipart module: ${name}`);
		const content = Buffer.from(await part.arrayBuffer());
		assert.equal(content.length, asset.bytes, name);
		assert.equal(digest(content), asset.sha256, `Wrangler changed raw PHP module ${name}`);
		assert.equal(part.type, name.endsWith('.wasm') ? 'application/wasm' : 'application/javascript+module');
	}
	// This build command bundles the tiny entry; only the external PHP module
	// parts are asserted byte-identical. Production deploy still uses no-bundle.
	for(const file of stage.files)
		assert.equal(digest(await fs.readFile(path.join(stageRoot, file.path))), file.sha256, `Offline build mutated staged ${file.path}`);
});
