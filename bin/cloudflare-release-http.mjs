import https from 'node:https';

export const PROJECT = 'php-wasm-nightly';
export const PRODUCTION_URL = 'https://nightly.php-wasm.seanmorr.is';
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

/**
 * Read HTTPS responses without transparently decoding their compressed bodies.
 * @param {string|URL} url Endpoint.
 * @param {object} options Method, headers and abort signal.
 * @param {object} dependencies Optional HTTPS adapter for isolated tests.
 * @returns {Promise<Response>} Response containing the original wire bytes.
 */
export function rawFetch(url, {method = 'GET', headers = {}, signal, body} = {}, dependencies = {})
{
	return new Promise((resolve, reject) => {
		const request = (dependencies.request ?? https.request)(url, {method, headers, signal}, response => {
			const chunks = [];
			let bytes = 0;
			response.on('data', chunk => {
				bytes += chunk.length;
				if(bytes > MAX_RESPONSE_BYTES) request.destroy(new Error('HTTP response exceeded the release size limit'));
				else chunks.push(chunk);
			});
			response.on('error', reject);
			response.on('end', () => {
				const content = method === 'HEAD' || [204, 205, 304].includes(response.statusCode) ? null : Buffer.concat(chunks);
				try { resolve(new Response(content, {status: response.statusCode, headers: response.headers})); }
				catch(error) { reject(error); }
			});
		});
		request.on('error', reject);
		request.end(body);
	});
}

/**
 * Build the bounded transport shared by deployment, cache configuration and probes.
 * @param {object} dependencies Optional network, clock and polling adapters.
 * @returns {object} Request, response metadata and bounded retry operations.
 */
export function createReleaseClient(dependencies = {})
{
	const now = dependencies.now ?? Date.now;
	const sleep = dependencies.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
	const fetch = dependencies.fetch ?? rawFetch;
	const timeoutMs = dependencies.timeoutMs ?? 120_000;
	const intervalMs = dependencies.intervalMs ?? 2_000;
	if(!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600_000
		|| !Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > timeoutMs)
		throw new Error('Invalid bounded polling settings');
	const observations = new WeakMap;
	const request = async (url, init = {}, deadline = now() + timeoutMs) => {
		const target = new URL(url);
		const headers = new Headers(init.headers);
		const details = {
			endpoint: target.hostname === 'api.cloudflare.com' ? 'Cloudflare API' : target.origin + target.pathname
			, method: init.method ?? 'GET'
			, requestedEncoding: headers.get('Accept-Encoding') ?? undefined
		};
		const started = now();
		const limit = Math.max(0, Math.min(15_000, deadline - started));
		const controller = new AbortController();
		let timer, timedOut = !limit;
		try
		{
			if(!limit) throw new Error('Request deadline exceeded');
			const response = await Promise.race([
				fetch(url, {...init, signal: controller.signal, redirect: 'error'})
				, new Promise((resolve, reject) => timer = setTimeout(() => {
					timedOut = true;
					controller.abort();
					reject(new Error('Request deadline exceeded'));
				}, limit))
			]);
			observations.set(response, {...details, elapsedMs: now() - started});
			return response;
		}
		catch(error)
		{
			const candidate = error?.code ?? error?.cause?.code;
			const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : undefined;
			const reason = timedOut ? `timed out after ${limit}ms` : `failed${code ? ` (${code})` : ''}`;
			const encoding = details.requestedEncoding ? ` [${details.requestedEncoding}]` : '';
			throw Object.assign(new Error(`Release HTTP request ${reason}: ${details.method} ${details.endpoint}${encoding}`), {
				details: {...details, kind: timedOut ? 'timeout' : 'network', elapsedMs: now() - started, timeoutMs: limit, code}
			});
		}
		finally { clearTimeout(timer); }
	};
	const describe = response => {
		const bounded = name => response.headers.get(name)?.replace(/[^\x20-\x7e]/g, '').slice(0, 256) ?? undefined;
		return {
			...observations.get(response)
			, status: response.status
			, receivedEncoding: (bounded('content-encoding') ?? 'identity').toLowerCase()
			, cacheStatus: bounded('cf-cache-status')
			, age: bounded('age')
			, cacheControl: bounded('cache-control')
			, rayId: bounded('cf-ray')
		};
	};
	const retry = async (operation, label) => {
		const started = now();
		const deadline = started + timeoutMs;
		let failure, firstFailure, attempts = 0;
		for(; attempts <= Math.ceil(timeoutMs / intervalMs) && now() < deadline;)
		{
			try { return await operation(deadline, ++attempts); }
			catch(error) { failure = error; firstFailure ??= error; }
			await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
		}
		const detail = failure?.message ?? 'timeout';
		const first = firstFailure?.message && firstFailure.message !== detail ? `; first failure: ${firstFailure.message}` : '';
		const record = error => error && {message: error.message, ...error.details};
		throw Object.assign(new Error(`${label} failed within the bounded verification window: ${detail}${first}`), {
			details: {attempts, elapsedMs: now() - started, firstFailure: record(firstFailure), lastFailure: record(failure)}
		});
	};
	return {now, request, describe, retry};
}
