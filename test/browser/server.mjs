import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const repoRoot = process.cwd();
const basePath = '/php-wasm';

const mimeTypes = {
	'.br': 'application/octet-stream'
	, '.css': 'text/css; charset=utf-8'
	, '.data': 'application/octet-stream'
	, '.gz': 'application/octet-stream'
	, '.html': 'text/html; charset=utf-8'
	, '.js': 'text/javascript; charset=utf-8'
	, '.json': 'application/json; charset=utf-8'
	, '.map': 'application/json; charset=utf-8'
	, '.mjs': 'text/javascript; charset=utf-8'
	, '.php': 'text/plain; charset=utf-8'
	, '.so': 'application/octet-stream'
	, '.txt': 'text/plain; charset=utf-8'
	, '.wasm': 'application/wasm'
};

const mounts = [
	{
		prefix: `${basePath}/fixtures/`
		, root: path.resolve(repoRoot, 'test/browser/fixtures')
	}
	, {
		prefix: `${basePath}/harness/`
		, root: path.resolve(repoRoot, 'test/browser/harness')
	}
	, {
		prefix: '/packages/'
		, root: path.resolve(repoRoot, 'packages')
	}
	, {
		prefix: '/node_modules/@electric-sql/pglite/'
		, root: path.resolve(repoRoot, 'node_modules/@electric-sql/pglite')
	}
];

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
	const mimeType = mimeTypes[extension] ?? 'application/octet-stream';
	const headers = {'content-type': mimeType};

	if(req.url?.startsWith(`${basePath}/cgi-worker.mjs`))
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

const resolveMountedFile = pathname => {
	if(pathname === `${basePath}/cgi-worker.mjs`)
	{
		return path.resolve(repoRoot, 'test/browser/harness/cgi-worker.mjs');
	}

	if(pathname === basePath || pathname === `${basePath}/`)
	{
		return path.resolve(repoRoot, 'test/browser/harness/index.html');
	}

	for(const mount of mounts)
	{
		if(!pathname.startsWith(mount.prefix))
		{
			continue;
		}

		const relativePath = decodeURIComponent(pathname.slice(mount.prefix.length) || 'index.html');
		const requestedPath = relativePath.endsWith('/')
			? `${relativePath}index.html`
			: relativePath;

		return safeJoin(mount.root, requestedPath);
	}

	return null;
};

const server = http.createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://127.0.0.1');

	if(url.pathname === '/')
	{
		send(res, 302, '', {location: `${basePath}/`});
		return;
	}

	const file = resolveMountedFile(url.pathname);

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

const port = Number(process.env.BROWSER_TEST_PORT ?? 9000);

server.listen(port, '127.0.0.1', () => {
	process.stdout.write(`browser-test-server listening on http://127.0.0.1:${port}${basePath}/\n`);
});

const close = () => server.close(() => process.exit(0));

process.on('SIGINT', close);
process.on('SIGTERM', close);
