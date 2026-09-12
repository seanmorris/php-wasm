const mimeTypes = {
	wasm: 'application/wasm', mjs: 'application/javascript', js: 'application/javascript'
	, json: 'application/json', html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8'
	, txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', svg: 'image/svg+xml'
	, png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip'
};

/** Parse supported encodings, respecting explicit exclusions and identity. */
export function acceptedEncodings(header)
{
	const values = new Map;
	for(const item of (header ?? '').split(','))
	{
		const [token, ...parameters] = item.trim().toLowerCase().split(';');
		if(!token) continue;
		let quality = 1;
		for(const parameter of parameters)
		{
			const match = /^\s*q\s*=\s*(.*?)\s*$/.exec(parameter);
			if(match) quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?|\.\d{1,3})$/.test(match[1]) ? Number(match[1]) : 0;
		}
		values.set(token, Math.min(values.get(token) ?? 1, quality));
	}
	const weight = encoding => values.get(encoding) ?? (encoding === 'identity'
		? (values.get('*') === 0 ? 0 : 1) : (header ? values.get('*') ?? 0 : 0));
	return ['br', 'gzip', 'identity'].map((encoding, order) => ({encoding, quality: weight(encoding), order}))
		.filter(({quality}) => quality > 0).sort((a, b) => b.quality - a.quality || a.order - b.order)
		.map(({encoding}) => encoding);
}

/** Common download headers, including failures and identity responses. */
export function downloadHeaders(extra = {})
{
	return new Headers({
		'Access-Control-Allow-Origin': '*'
		, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
		, 'Access-Control-Expose-Headers': 'Content-Length, Content-Encoding, ETag'
		, 'Vary': 'Accept-Encoding'
		, 'X-Content-Type-Options': 'nosniff'
		, ...extra
	});
}

/** Serve an R2 object with standards-aware precompressed variant negotiation. */
export async function serveNightlyAsset(request, env)
{
	const headers = downloadHeaders();
	if(request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
	if(!['GET', 'HEAD'].includes(request.method))
	{
		headers.set('Allow', 'GET, HEAD, OPTIONS');
		return new Response('Method not allowed', {status: 405, headers});
	}
	const url = new URL(request.url);
	let key;
	try { key = decodeURIComponent(url.pathname.slice(1)); }
	catch { return new Response(request.method === 'HEAD' ? null : 'Invalid path', {status: 400, headers}); }
	if(key.split('/').some(segment => segment === '..' || segment === '.') || key.includes('\\') || key.includes('\0'))
		return new Response(request.method === 'HEAD' ? null : 'Invalid path', {status: 400, headers});
	if(!env.NIGHTLY_BUILDS) return new Response(request.method === 'HEAD' ? null : 'Asset storage unavailable', {status: 503, headers});
	try
	{
		let original = key ? await env.NIGHTLY_BUILDS.head(key) : null;
		if(!original && (!key || key.endsWith('/') || !key.split('/').at(-1).includes('.')))
		{
			if(!url.pathname.endsWith('/'))
			{
				url.pathname += '/';
				headers.set('Location', url.href);
				return new Response(null, {status: 302, headers});
			}
			key += 'index.html';
			original = await env.NIGHTLY_BUILDS.head(key);
		}
		if(!original) return new Response(request.method === 'HEAD' ? null : 'Not found', {status: 404, headers});
		// Cloudflare rewrites the incoming header to "br, gzip". The original
		// client's weights/exclusions live in cf.clientAcceptEncoding instead.
		const clientEncoding = request.cf && Object.hasOwn(request.cf, 'clientAcceptEncoding')
			? request.cf.clientAcceptEncoding : request.headers.get('Accept-Encoding');
		const encodings = acceptedEncodings(clientEncoding);
		// Explicit sidecars are downloads, not content-encoded original resources.
		const sidecar = /\.(?:br|gz)$/.test(key);
		let selected, encoding, selectedKey;
		for(const candidate of encodings)
		{
			if(sidecar && candidate !== 'identity') continue;
			const candidateKey = candidate === 'identity' ? key : key + (candidate === 'br' ? '.br' : '.gz');
			const object = candidate === 'identity' ? original : await env.NIGHTLY_BUILDS.head(candidateKey);
			if(!object) continue;
			const declared = object.httpMetadata?.contentEncoding?.toLowerCase();
			if(!sidecar && declared && declared !== 'identity' && declared !== candidate) continue;
			selected = object; encoding = candidate; selectedKey = candidateKey;
			break;
		}
		if(!selected) return new Response(request.method === 'HEAD' ? null : 'No acceptable encoding', {status: 406, headers});
		const extension = key.split('.').at(-1).toLowerCase();
		headers.set('Content-Type', sidecar ? 'application/octet-stream' : (mimeTypes[extension] ?? original.httpMetadata?.contentType ?? 'application/octet-stream'));
		headers.set('Cache-Control', 'public, max-age=300, no-transform');
		if(encoding !== 'identity') headers.set('Content-Encoding', encoding);
		if(Number.isSafeInteger(selected.size)) headers.set('Content-Length', String(selected.size));
		if(selected.httpEtag) headers.set('ETag', selected.httpEtag);
		if(request.method === 'HEAD') return new Response(null, {headers, encodeBody: 'manual'});
		const object = await env.NIGHTLY_BUILDS.get(selectedKey);
		if(!object) return new Response('Not found', {status: 404, headers: downloadHeaders()});
		return new Response(object.body, {headers, encodeBody: 'manual'});
	}
	catch
	{
		return new Response(request.method === 'HEAD' ? null : 'Asset storage unavailable', {status: 502, headers: downloadHeaders()});
	}
}
