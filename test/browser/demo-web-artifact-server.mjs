import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const basePath = '/php-wasm';
const artifactRoot = path.resolve(process.cwd(), process.env.DEMO_WEB_ARTIFACT_ROOT ?? 'docs');

const mimeTypes = {
	'.css': 'text/css; charset=utf-8'
	, '.dat': 'application/octet-stream'
	, '.gif': 'image/gif'
	, '.html': 'text/html; charset=utf-8'
	, '.ico': 'image/x-icon'
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

const send = (res, status, body, headers = {}) => {
	res.writeHead(status, headers);
	res.end(body);
};

const safeJoin = (root, requestedPath) => {
	const resolvedRoot = path.resolve(root);
	const resolvedPath = path.resolve(resolvedRoot, requestedPath);

	if(!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`) && resolvedPath !== resolvedRoot)
	{
		return null;
	}

	return resolvedPath;
};

const serveFile = (req, res, file) => {
	const extension = path.extname(file).toLowerCase();
	const headers = {
		'content-type': mimeTypes[extension] ?? 'application/octet-stream'
	};

	if(req.url?.startsWith(`${basePath}/cgi-worker.js`))
	{
		headers['service-worker-allowed'] = `${basePath}/`;
	}

	const stream = fs.createReadStream(file);

	stream.on('open', () => {
		res.writeHead(200, headers);
		stream.pipe(res);
	});

	stream.on('error', error => {
		send(res, 500, String(error), {'content-type': 'text/plain; charset=utf-8'});
	});
};

const resolveRequestedFile = pathname => {
	if(pathname === basePath || pathname === `${basePath}/`)
	{
		return safeJoin(artifactRoot, 'index.html');
	}

	if(!pathname.startsWith(`${basePath}/`))
	{
		return null;
	}

	const relativePath = decodeURIComponent(pathname.slice(basePath.length + 1) || 'index.html');
	const requestedPath = relativePath.endsWith('/')
		? `${relativePath}index.html`
		: relativePath;

	const candidatePaths = [
		requestedPath
		, pathname.replace(/^\/+/, '')
	];

	for(const candidatePath of candidatePaths)
	{
		const file = safeJoin(artifactRoot, candidatePath);

		if(file && fs.existsSync(file))
		{
			return file;
		}
	}

	return safeJoin(artifactRoot, '404.html');
};

const server = http.createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://127.0.0.1');

	if(url.pathname === '/')
	{
		send(res, 302, '', {location: `${basePath}/`});
		return;
	}

	const file = resolveRequestedFile(url.pathname);

	if(!file)
	{
		send(res, 404, 'Not Found', {'content-type': 'text/plain; charset=utf-8'});
		return;
	}

	fs.stat(file, (error, stats) => {
		if(error || !stats.isFile())
		{
			send(res, 404, 'Not Found', {'content-type': 'text/plain; charset=utf-8'});
			return;
		}

		serveFile(req, res, file);
	});
});

const port = Number(process.env.BROWSER_TEST_PORT ?? process.env.DEMO_WEB_E2E_PORT ?? 9414);

server.listen(port, '127.0.0.1', () => {
	process.stdout.write(`demo-web-artifact-server listening on http://127.0.0.1:${port}${basePath}/\n`);
});

const close = () => server.close(() => process.exit(0));

process.on('SIGINT', close);
process.on('SIGTERM', close);
