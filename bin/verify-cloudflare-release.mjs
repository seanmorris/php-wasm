#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
import {createReleaseClient, MAX_RESPONSE_BYTES, PRODUCTION_URL} from './cloudflare-release-http.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireCondition = (condition, message) => { if(!condition) throw new Error(message); };

/**
 * Validate a saved smoke inventory before using its paths for public requests.
 * @param {object} stage The stage.manifest.json from a tested release.
 * @returns {void}
 */
export function validateSmokeManifest(stage)
{
	requireCondition(stage?.schema === 1 && stage.phpVersion === '8.5'
		&& typeof stage.buildId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(stage.buildId), 'Invalid smoke manifest identity');
	requireCondition(Array.isArray(stage.assets) && stage.assets.length > 0 && stage.assets.length <= 128, 'Invalid smoke asset inventory');
	const names = new Set;
	const prefix = `/${stage.buildId}/php-cloud-wasm/`;
	for(const asset of stage.assets)
	{
		const name = typeof asset?.path === 'string' && asset.path.startsWith(prefix) ? asset.path.slice(prefix.length) : '';
		requireCondition(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:mjs|wasm)$/.test(name) && !names.has(name), 'Invalid or duplicate smoke asset path');
		names.add(name);
		requireCondition(asset.encodings && typeof asset.encodings === 'object' && !Array.isArray(asset.encodings), 'Invalid smoke encoding inventory');
		for(const [encoding, metadata] of [['identity', asset], ...Object.entries(asset.encodings)])
		{
			requireCondition(['identity', 'br', 'gzip'].includes(encoding) && (encoding !== 'identity' || metadata === asset), 'Unsupported smoke content encoding');
			requireCondition(metadata && /^[a-f0-9]{64}$/.test(metadata.sha256) && Number.isSafeInteger(metadata.bytes)
				&& metadata.bytes >= 0 && metadata.bytes <= MAX_RESPONSE_BYTES, 'Invalid smoke digest or size');
		}
		if(name.endsWith('.wasm') || name === 'php8.5-cloudflare-runtime.mjs')
			requireCondition(asset.encodings.br && asset.encodings.gzip, 'Runtime JS and Wasm require Brotli and gzip smoke coverage');
	}
	requireCondition([...names].filter(name => name.endsWith('.wasm')).length === 1
		&& names.has('php8.5-cloudflare-runtime.mjs'), 'Smoke inventory requires one Wasm module and the PHP 8.5 runtime');
}

/**
 * Check live PHP and exact artifact bytes without deploying or using credentials.
 * @param {object} options Stage manifest, HTTPS origin and diagnostic phase name.
 * @param {object} dependencies Optional shared release client or transport adapters.
 * @returns {Promise<object>} Phase results; failures carry the same result as verification.
 */
export async function verifyCloudflareRelease({stage, baseUrl, phase = 'verification'}, dependencies = {})
{
	validateSmokeManifest(stage);
	const base = new URL(baseUrl);
	requireCondition(base.protocol === 'https:' && !base.username && !base.password
		&& base.pathname === '/' && !base.search && !base.hash, 'Smoke target must be an HTTPS origin without credentials, a path or a query');
	requireCondition(['verification', 'preview', 'production-deployment', 'production-public'].includes(phase), 'Invalid verification phase');
	const client = dependencies.client ?? createReleaseClient(dependencies);
	const requireCacheHits = base.origin === PRODUCTION_URL;
	const started = client.now();
	const result = {schema: 1, buildId: stage.buildId, phase, baseUrl: base.origin, status: 'running', requireCacheHits, attempts: 0, checks: []};
	try
	{
		await client.retry(async (deadline, attempt) => {
			result.attempts = attempt;
			result.checks = [];
			const request = async (route, {encoding = 'identity', accept = encoding, method = 'GET', round, health = false} = {}) => {
				const headers = {'Accept-Encoding': accept};
				if(health) headers['Cache-Control'] = 'no-cache';
				const response = await client.request(new URL(route, base), {method, headers}, deadline);
				const details = {...client.describe(response), expectedEncoding: encoding, round};
				result.checks.push(details);
				return {response, details};
			};
			const expect = (condition, message, details) => {
				if(condition) return;
				const encoding = details.requestedEncoding ? ` [${details.requestedEncoding}]` : '';
				const cache = details.cacheStatus ? `; cache ${details.cacheStatus}` : '';
				throw Object.assign(new Error(`${message}: ${details.method} ${details.endpoint}${encoding}${cache}`), {details: {...details, kind: 'verification'}});
			};
			for(const route of ['/php/health', '/php/d1'])
			{
				const {response, details} = await request(route, {health: true});
				expect(response.status === 200 && response.headers.get('content-type')?.includes('application/json'), `PHP/D1 smoke failed at ${route} (HTTP ${response.status})`, details);
				let health;
				try { health = await response.json(); }
				catch { expect(false, 'Malformed PHP/D1 health response', details); }
				expect(health?.ok === true && health.buildId === stage.buildId && health.phpVersion === '8.5'
					&& /^8\.5\.\d+[A-Za-z0-9.-]*$/.test(health.phpFullVersion) && health.sapi === 'embed'
					&& health.driver === 'cfd1' && health.d1?.answer === 42, 'PHP/D1 health identity or result mismatch', details);
			}
			for(const route of ['/php/', '/php/phpinfo'])
			{
				const {response, details} = await request(route, {health: true});
				expect(response.status === 200 && response.headers.get('content-type')?.includes('text/html'), `PHP HTML smoke failed at ${route} (HTTP ${response.status})`, details);
				const html = await response.text();
				expect(/8\.5\.\d+/.test(html), 'PHP version is missing', details);
				if(route === '/php/') expect(html.includes('PHP on Cloudflare') && html.includes(`/${stage.buildId}/php-cloud-wasm/`), 'PHP home page identity mismatch', details);
				else expect(/PHP Version/i.test(html) && /cfd1/i.test(html), 'PHP information page is missing PHP or the D1 driver', details);
			}
			for(const asset of stage.assets)
			{
				const variants = [['identity', asset], ...['br', 'gzip'].filter(encoding => asset.encodings[encoding]).map(encoding => [encoding, asset.encodings[encoding]])];
				const check = async (encoding, expected, options = {}) => {
					const {response, details} = await request(asset.path, {encoding, ...options});
					expect(response.status === 200, `Static asset HTTP ${response.status}`, details);
					expect(details.receivedEncoding === encoding, `Incorrect content encoding; expected ${encoding}, received ${details.receivedEncoding}`, details);
					if(Object.keys(asset.encodings).length)
						expect(response.headers.get('vary')?.toLowerCase().split(/\s*,\s*/).includes('accept-encoding'), 'Static response lacks Vary: Accept-Encoding', details);
					const contentType = response.headers.get('content-type')?.split(';')[0].trim();
					expect(asset.path.endsWith('.wasm') ? contentType === 'application/wasm' : ['application/javascript', 'text/javascript'].includes(contentType), 'Incorrect static content type', details);
					if(options.method === 'HEAD')
					{
						expect(response.headers.has('content-length') && Number(response.headers.get('content-length')) === expected.bytes, 'Incorrect HEAD content length', details);
						expect((await response.arrayBuffer()).byteLength === 0, 'HEAD response contains a body', details);
						return;
					}
					const bytes = Buffer.from(await response.arrayBuffer());
					expect(bytes.length === expected.bytes && sha256(bytes) === expected.sha256, `Served ${encoding} digest mismatch`, details);
					let decoded;
					try { decoded = encoding === 'br' ? brotliDecompressSync(bytes, {maxOutputLength: MAX_RESPONSE_BYTES}) : encoding === 'gzip' ? gunzipSync(bytes, {maxOutputLength: MAX_RESPONSE_BYTES}) : bytes; }
					catch { expect(false, 'Served encoding cannot be decoded', details); }
					expect(decoded.length === asset.bytes && sha256(decoded) === asset.sha256, 'Served encoding does not match original artifact', details);
					if(requireCacheHits && options.round === 2)
						expect(details.cacheStatus === 'HIT', 'Repeated static request did not hit the CDN cache', details);
				};
				// Reuse the canonical URL. A per-encoding query would hide a broken cache key.
				for(const round of [1, 2])
					for(const [encoding, expected] of variants) await check(encoding, expected, {round});
				for(const [encoding, expected] of variants)
				{
					await check(encoding, expected, {method: 'HEAD'});
					if(encoding !== 'identity') await check(encoding, expected, {accept: `${encoding}, identity;q=0`});
				}
			}
		}, `PHP/D1 and static smoke at ${base.origin}`);
		result.status = 'success';
		result.elapsedMs = client.now() - started;
		return result;
	}
	catch(error)
	{
		Object.assign(result, {status: 'failed', elapsedMs: client.now() - started, error: error.message, ...error.details});
		error.verification = result;
		throw error;
	}
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	try
	{
		const args = process.argv.slice(2);
		if(args.length === 1 && args[0] === '--help')
			console.log('Usage: node bin/verify-cloudflare-release.mjs --stage-manifest FILE --base-url HTTPS_ORIGIN');
		else
		{
			const options = {};
			const flags = {'--stage-manifest': 'manifestPath', '--base-url': 'baseUrl'};
			while(args.length)
			{
				const flag = args.shift();
				requireCondition(Object.hasOwn(flags, flag) && args.length && !args[0].startsWith('--') && !Object.hasOwn(options, flags[flag]), 'Unknown, repeated or incomplete verification option');
				options[flags[flag]] = args.shift();
			}
			requireCondition(options.manifestPath && options.baseUrl, '--stage-manifest and --base-url are required');
			let stage;
			try { stage = JSON.parse(await fs.readFile(options.manifestPath, 'utf8')); }
			catch { throw new Error('Unable to read a JSON stage manifest'); }
			console.log(JSON.stringify(await verifyCloudflareRelease({stage, baseUrl: options.baseUrl}), null, 2));
		}
	}
	catch(error)
	{
		console.log(JSON.stringify(error.verification ?? {schema: 1, status: 'failed', error: error.message}, null, 2));
		process.exitCode = 1;
	}
}
