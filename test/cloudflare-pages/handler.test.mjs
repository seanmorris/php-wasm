import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync, brotliCompressSync, gunzipSync, brotliDecompressSync } from 'node:zlib';
import { acceptedEncodings, serveNightlyAsset } from '../../.cloudflare/pages/r2.mjs';
import { createPagesWorker, OUTPUT_LIMIT } from '../../.cloudflare/pages/demo.mjs';

const build = {buildId: 'build-123', phpVersion: '8.5'};
const health = {phpFullVersion: '8.5.1', sapi: 'embed', driver: 'cfd1', d1: {answer: 42}};
const request = (pathname, options) => new Request(`https://nightly.example${pathname}`, options);

/**
 * Creates an R2-shaped in-memory fixture with observable reads.
 * @param {object} entries Key to bytes/metadata definitions.
 * @returns {object} Mock bucket and read log.
 */
function bucket(entries)
{
	const reads = [];
	const metadata = key => key in entries ? {
		size: Buffer.from(entries[key].body ?? entries[key]).length
		, httpEtag: `"${key}"`
		, httpMetadata: entries[key].metadata ?? {contentType: 'application/octet-stream'}
	} : null;
	return {
		reads
		, async head(key) { reads.push(['head', key]); return metadata(key); }
		, async get(key) { reads.push(['get', key]); return key in entries ? {...metadata(key), body: Buffer.from(entries[key].body ?? entries[key])} : null; }
	};
}

/**
 * Supplies a fake public wrapper without bypassing handler byte capture.
 * @param {function(object, string): Promise<number>} run Fake PHP behavior.
 * @returns {function(object): object} Wrapper constructor.
 */
function fakePhp(run)
{
	return class {
		constructor(args) { this.args = args; }
		run(code) { return run(this.args, code); }
	};
}

/**
 * Emits raw UTF-8 through the public wrapper output callback.
 * @param {object} args Constructor arguments.
 * @param {string} text PHP output fixture.
 */
function emit(args, text)
{
	for(const byte of new TextEncoder().encode(text)) args.stdout(byte);
}

test('Accept-Encoding parses weights, wildcard exclusions, case and identity', () => {
	assert.deepEqual(acceptedEncodings(null), ['identity']);
	assert.deepEqual(acceptedEncodings(''), ['identity']);
	assert.deepEqual(acceptedEncodings('BR;q=0, gzip;q=1'), ['gzip', 'identity']);
	assert.deepEqual(acceptedEncodings('gzip;q=1, br;q=.5, identity;q=.1'), ['gzip', 'br', 'identity']);
	assert.deepEqual(acceptedEncodings('*;q=.5, br;q=0, identity;q=0'), ['gzip']);
	assert.deepEqual(acceptedEncodings('*;q=0'), []);
	assert.deepEqual(acceptedEncodings('br;q=invalid, gzip;q=2, identity;q=0'), []);
	assert.deepEqual(acceptedEncodings('br;q=1, br;q=0'), ['identity']);
});

test('R2 serves identity, Brotli and gzip without changing bytes or original MIME', async () => {
	const raw = Buffer.from('export const answer = 42;');
	const env = {NIGHTLY_BUILDS: bucket({'runtime.mjs': raw, 'runtime.mjs.br': brotliCompressSync(raw), 'runtime.mjs.gz': gzipSync(raw)})};
	for(const [accept, encoding, decode] of [['identity', null, value => value], ['br', 'br', brotliDecompressSync], ['br;q=0,gzip', 'gzip', gunzipSync], ['gzip;q=1,br;q=.5', 'gzip', gunzipSync]])
	{
		const response = await serveNightlyAsset(request('/runtime.mjs', {headers: {'Accept-Encoding': accept}}), env);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('Content-Type'), 'application/javascript');
		assert.equal(response.headers.get('Content-Encoding'), encoding);
		assert.equal(response.headers.get('Vary'), 'Accept-Encoding');
		assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
		assert.match(response.headers.get('Cache-Control'), /no-transform/);
		assert.deepEqual(decode(Buffer.from(await response.arrayBuffer())), raw);
	}
});

test('R2 respects identity exclusion and falls back only to available acceptable variants', async () => {
	const env = {NIGHTLY_BUILDS: bucket({'a.wasm': 'raw', 'a.wasm.gz': 'gzip'})};
	const gzip = await serveNightlyAsset(request('/a.wasm', {headers: {'Accept-Encoding': 'br;q=1,gzip;q=.5,identity;q=0'}}), env);
	assert.equal(gzip.headers.get('Content-Encoding'), 'gzip');
	assert.equal(gzip.headers.get('Content-Type'), 'application/wasm');
	const rejected = await serveNightlyAsset(request('/a.wasm', {headers: {'Accept-Encoding': 'br,identity;q=0'}}), env);
	assert.equal(rejected.status, 406);
	assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), '*');
});

test('R2 uses Cloudflare original client encoding instead of the rewritten br,gzip header', async () => {
	const env = {NIGHTLY_BUILDS: bucket({'a.wasm': 'identity', 'a.wasm.br': 'br', 'a.wasm.gz': 'gzip'})};
	for(const [original, expected] of [['identity', null], ['br;q=0,gzip', 'gzip'], [null, null], ['', null]])
	{
		const input = request('/a.wasm', {headers: {'Accept-Encoding': 'br, gzip'}});
		Object.defineProperty(input, 'cf', {value: {clientAcceptEncoding: original}});
		const response = await serveNightlyAsset(input, env);
		assert.equal(response.headers.get('Content-Encoding'), expected);
	}
});

test('R2 HEAD negotiates identical headers but never retrieves the object body', async () => {
	const storage = bucket({'a.wasm': 'raw', 'a.wasm.br': 'brotli'});
	const response = await serveNightlyAsset(request('/a.wasm', {method: 'HEAD', headers: {'Accept-Encoding': 'br'}}), {NIGHTLY_BUILDS: storage});
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('Content-Encoding'), 'br');
	assert.equal(response.headers.get('Content-Length'), '6');
	assert.equal(await response.text(), '');
	assert.equal(storage.reads.some(([method]) => method === 'get'), false);
});

test('explicit sidecars are raw downloads, never sidecar-of-sidecar or double-encoded', async () => {
	const storage = bucket({'a.wasm.br': {body: 'brotli', metadata: {contentEncoding: 'br'}}, 'a.wasm.br.br': 'wrong'});
	const response = await serveNightlyAsset(request('/a.wasm.br', {headers: {'Accept-Encoding': 'br,gzip'}}), {NIGHTLY_BUILDS: storage});
	assert.equal(response.headers.get('Content-Encoding'), null);
	assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
	assert.equal(await response.text(), 'brotli');
	assert.equal(storage.reads.some(([, key]) => key.endsWith('.br.br')), false);
});

test('zero-byte files, nested directory indexes, redirects and CORS failures remain valid', async () => {
	const env = {NIGHTLY_BUILDS: bucket({'empty.txt': '', 'index.html': 'root', 'v1.2/build/index.html': 'nested'})};
	assert.equal((await serveNightlyAsset(request('/empty.txt'), env)).status, 200);
	assert.equal(await (await serveNightlyAsset(request('/'), env)).text(), 'root');
	const redirect = await serveNightlyAsset(request('/v1.2/build?keep=1'), env);
	assert.equal(redirect.status, 302);
	assert.equal(redirect.headers.get('Location'), 'https://nightly.example/v1.2/build/?keep=1');
	assert.equal(await (await serveNightlyAsset(request('/v1.2/build/'), env)).text(), 'nested');
	for(const [url, options, status] of [['/missing.wasm', {}, 404], ['/empty.txt', {method: 'POST'}, 405], ['/%invalid', {}, 400], ['/empty.txt', {method: 'OPTIONS'}, 204]])
	{
		const response = await serveNightlyAsset(request(url, options), env);
		assert.equal(response.status, status);
		assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
	}
});

test('PHP routes run only fixed code and snapshot each request D1 binding', async () => {
	const calls = [];
	const worker = createPagesWorker(fakePhp(async (args, code) => { calls.push({args, code}); emit(args, JSON.stringify(health)); return 0; }), build);
	for(const id of ['first', 'second'])
	{
		const response = await worker.fetch(request('/php/health?code=arbitrary&sql=DROP'), {NIGHTLY_PHP_DB: {id}});
		assert.deepEqual(await response.json(), {ok: true, ...build, ...health});
	}
	assert.notEqual(calls[0].args.cfd1, calls[1].args.cfd1);
	assert.deepEqual(calls.map(call => call.args.cfd1.mainDb.id), ['first', 'second']);
	assert.match(calls[0].code, /SELECT \? AS answer/);
	assert.match(calls[0].code, /PDO::PARAM_INT/);
	assert.doesNotMatch(calls[0].code, /arbitrary|DROP/);
});

test('PHP routing rejects unknown paths and methods without constructing an instance', async () => {
	let instances = 0;
	const worker = createPagesWorker(fakePhp(async () => { instances++; return 0; }), build);
	assert.equal((await worker.fetch(request('/php/missing'), {})).status, 404);
	assert.equal((await worker.fetch(request('/php/health', {method: 'POST', body: 'code'}), {})).status, 405);
	assert.equal((await worker.fetch(request('/php'), {})).status, 308);
	assert.equal(instances, 0);
});

test('phpinfo omits environment and variables flags; HTML gets a restrictive CSP', async () => {
	let source;
	const worker = createPagesWorker(fakePhp(async (args, code) => { source = code; emit(args, '<html>PHP</html>'); return 0; }), build);
	const response = await worker.fetch(request('/php/phpinfo'), {});
	assert.equal(response.status, 200);
	assert.match(source, /INFO_GENERAL \| INFO_CONFIGURATION \| INFO_MODULES \| INFO_LICENSE/);
	assert.doesNotMatch(source, /INFO_ALL|INFO_ENVIRONMENT|INFO_VARIABLES/);
	assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
	assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('PHP admission returns 503 during overlap and retains busy state after a timeout', async () => {
	let finish;
	let runs = 0;
	const settled = [];
	const worker = createPagesWorker(fakePhp(async args => {
		runs++;
		await new Promise(resolve => { finish = resolve; });
		emit(args, JSON.stringify(health));
		return 0;
	}), build, {wallTimeoutMs: 10});
	const first = worker.fetch(request('/php/health'), {}, {waitUntil: promise => settled.push(promise)});
	assert.equal((await worker.fetch(request('/php/health'), {})).status, 503);
	assert.equal((await first).status, 504);
	assert.equal((await worker.fetch(request('/php/health'), {})).status, 503);
	assert.equal(runs, 1);
	finish();
	await Promise.all(settled);
	const next = worker.fetch(request('/php/health'), {});
	finish();
	assert.equal((await next).status, 200);
	assert.equal(runs, 2);
});

test('PHP output is byte-capped before newline buffering and excess output is discarded', async () => {
	const worker = createPagesWorker(fakePhp(async args => {
		for(let count = 0; count <= OUTPUT_LIMIT; count++) args.stdout(65);
		return 0;
	}), build);
	const response = await worker.fetch(request('/php/'), {});
	assert.equal(response.status, 502);
	assert.deepEqual(await response.json(), {ok: false, error: 'php_output_limit'});
});

test('PHP failures do not leak diagnostics or poison admission, and HEAD executes health', async () => {
	let runs = 0;
	const worker = createPagesWorker(fakePhp(async args => {
		if(++runs === 1)
		{
			for(const byte of new TextEncoder().encode('sensitive fixture diagnostic')) args.stderr(byte);
			return 0;
		}
		emit(args, JSON.stringify(health)); return 0;
	}), build);
	const failed = await worker.fetch(request('/php/health'), {});
	assert.equal(failed.status, 502);
	assert.doesNotMatch(await failed.text(), /sensitive/);
	const head = await worker.fetch(request('/php/health', {method: 'HEAD'}), {});
	assert.equal(head.status, 200);
	assert.equal(await head.text(), '');
	assert.equal(runs, 2);
});
