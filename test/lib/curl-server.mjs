import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

/**
 * Serves curl fixtures shared by the Node tests and the browser harness.
 * Closing an aborted stream also stops its producer.
 * @param {import('node:http').IncomingMessage} request Fixture request.
 * @param {import('node:http').ServerResponse} response Fixture response.
 * @returns {boolean} Whether the fixture handled this request.
 */
export function curlFixture(request, response)
{
	const url = new URL(request.url, 'http://localhost');
	if(!url.pathname.startsWith('/php-wasm/curl/')) return false;
	if(url.searchParams.has('cors'))
	{
		response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
		response.setHeader('Access-Control-Allow-Credentials', 'true');
		response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Custom, Authorization');
		response.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, X-Test');
		if(request.method === 'OPTIONS')
		{ response.writeHead(204); response.end(); return true; }
	}
	const json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
	switch(url.pathname.split('/').pop())
	{
		case 'stream':
		{
			response.writeHead(200, {'Content-Type': 'text/plain', 'Content-Length': '65536', 'X-Test': 'stream'});
			response.flushHeaders();
			let count = 0;
			const timer = setInterval(() => {
				response.write(Buffer.alloc(4096, 120));
				if(++count === 16)
{ clearInterval(timer); response.end(); }
			}, 25);
			response.on('close', () => clearInterval(timer));
			break;
		}
		case 'redirect':
			response.writeHead(302, {Location: '/php-wasm/curl/echo'}); response.end(); break;
		case 'gzip':
			response.writeHead(200, {'Content-Encoding': 'gzip'}); response.end(gzipSync('decoded curl body')); break;
		case 'digest':
		{
			const fields = Object.fromEntries([...(request.headers.authorization || '').matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map(match => [match[1], match[2] ?? match[3]]));
			const hash = text => createHash('sha256').update(text).digest('hex');
			const expected = hash(`${hash('user:fixture:secret')}:nonce:${fields.nc}:${fields.cnonce}:auth:${hash(`${request.method}:${fields.uri}`)}`);
			if(fields.response !== expected || fields.uri !== request.url || fields.username !== 'user')
			{
				response.writeHead(401, {'WWW-Authenticate': 'Digest realm="fixture", nonce="nonce", algorithm=SHA-256, qop="auth"'});
				response.end('challenge');
			}
			else response.end('authenticated');
			break;
		}
		case 'echo':
		{
			const chunks = [];
			request.on('data', chunk => chunks.push(chunk));
			request.on('end', () => {
				const body = Buffer.concat(chunks);
				const timer = setTimeout(() => json({method: request.method, headers: request.headers, body: body.toString(), sha256: createHash('sha256').update(body).digest('hex')}), Number(url.searchParams.get('delay') || 0));
				response.on('close', () => clearTimeout(timer));
			});
			break;
		}
		default: response.writeHead(404); response.end();
	}
	return true;
}
