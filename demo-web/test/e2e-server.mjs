/**
 * Tiny static HTTP server used by demo-web end-to-end tests.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const buildDir = path.resolve(process.cwd(), 'build');
const basePath = '/php-wasm';

const mimeTypes = {
	'.css': 'text/css; charset=utf-8'
	, '.dat': 'application/octet-stream'
	, '.gif': 'image/gif'
	, '.html': 'text/html; charset=utf-8'
	, '.js': 'text/javascript; charset=utf-8'
	, '.json': 'application/json; charset=utf-8'
	, '.map': 'application/json; charset=utf-8'
	, '.mjs': 'text/javascript; charset=utf-8'
	, '.png': 'image/png'
	, '.so': 'application/octet-stream'
	, '.sql': 'text/plain; charset=utf-8'
	, '.svg': 'image/svg+xml'
	, '.txt': 'text/plain; charset=utf-8'
	, '.wasm': 'application/wasm'
	, '.woff': 'font/woff'
	, '.woff2': 'font/woff2'
	, '.zip': 'application/zip'
};

/**
 * Writes a complete HTTP response with the provided status and headers.
 */
const send = (res, status, body, headers = {}) => {
	res.writeHead(status, headers);
	res.end(body);
};

/**
 * Resolves a request path while preventing path traversal outside the build directory.
 */
const safeJoin = (root, requestedPath) => {
	const resolved = path.resolve(root, requestedPath);

	if(!resolved.startsWith(root))
	{
		return null;
	}

	return resolved;
};

/**
 * Streams a built asset using the mime type inferred from its extension.
 */
const serveFile = (res, file) => {
	const extension = path.extname(file).toLowerCase();
	const mimeType = mimeTypes[extension] ?? 'application/octet-stream';
	const stream = fs.createReadStream(file);

	stream.on('open', () => {
		res.writeHead(200, {'content-type': mimeType});
		stream.pipe(res);
	});

	stream.on('error', (error) => {
		send(res, 500, String(error), {'content-type': 'text/plain; charset=utf-8'});
	});
};

const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost');

	if(url.pathname === '/')
	{
		send(res, 302, '', {location: `${basePath}/`});
		return;
	}

	if(!url.pathname.startsWith(`${basePath}/`) && url.pathname !== basePath)
	{
		send(res, 404, 'Not Found', {'content-type': 'text/plain; charset=utf-8'});
		return;
	}

	const relativePath = url.pathname === basePath
		? 'index.html'
		: decodeURIComponent(url.pathname.slice(basePath.length + 1) || 'index.html');

	const requested = relativePath.endsWith('/')
		? `${relativePath}index.html`
		: relativePath;

	const file = safeJoin(buildDir, requested);

	if(!file)
	{
		send(res, 403, 'Forbidden', {'content-type': 'text/plain; charset=utf-8'});
		return;
	}

	fs.stat(file, (error, stats) => {
		if(!error && stats.isFile())
		{
			serveFile(res, file);
			return;
		}

		const fallback = safeJoin(buildDir, '404.html');

		if(fallback && fs.existsSync(fallback))
		{
			serveFile(res, fallback);
			return;
		}

		send(res, 404, 'Not Found', {'content-type': 'text/plain; charset=utf-8'});
	});
});

const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9414);

server.listen(port, '127.0.0.1', () => {
	process.stdout.write(`demo-web-e2e-server listening on http://127.0.0.1:${port}${basePath}/\n`);
});

/**
 * Gracefully shuts the server down when the runner exits.
 */
const close = () => server.close(() => process.exit(0));

process.on('SIGINT', close);
process.on('SIGTERM', close);
