import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const types = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.zip': 'application/zip', '.json': 'application/json'};
const port = Number(process.env.BENCH_PORT ?? 9024);

/**
 * Returns a test-local CGI source with awaited FS calls in request routing.
 * Initialization uses BenchmarkCgi; the production source stays unchanged.
 * @returns {Promise<string>} Adapted source with original request behavior.
 */
async function adaptedCgi()
{
	const source = await fs.readFile(path.join(root, 'source/PhpCgiBase.mjs'), 'utf8');
	const start = source.indexOf('\tasync _request(request, php)');
	const end = source.indexOf('\n\t/**\n\t * Reports a failed request', start);
	if(start < 0 || end < 0) throw new Error('CGI request method boundary changed');
	let request = source.slice(start, end);
	request = request.replace(/php\.FS\.analyzePath\(([^)]+)\)/g, '(await php.benchmarkFS.analyzePath($1))');
	request = request.replaceAll('php.FS.readFile(', 'await php.benchmarkFS.readFile(');
	request = request.replaceAll('php.FS.writeFile(', 'await php.benchmarkFS.writeFile(');
	request = request.replaceAll('php.FS.isFile(', 'php.benchmarkFS.isFile(');
	request = request.replaceAll('php.FS.isDir(', 'php.benchmarkFS.isDir(');
	return source.slice(0, start) + request + source.slice(end);
}

const server = http.createServer(async (request, response) => {
	try
	{
		const url = new URL(request.url, 'http://127.0.0.1');
		const relative = decodeURIComponent(url.pathname.replace(/^\/bench\//, ''));
		if(!url.pathname.startsWith('/bench/') || relative.split('/').includes('..'))
		{
			response.writeHead(404).end('Not found');
			return;
		}
		let data;
		let file = path.join(here, relative);
		if(relative === 'index.html')
		{
			data = '<!doctype html><title>CGI filesystem benchmark</title><h1>CGI filesystem benchmark</h1>';
		}
		else if(relative === 'worker.mjs' || relative === 'diagnostic-worker.mjs')
		{
			const backend = url.searchParams.get('backend');
			if(!['idbfs', 'opfs'].includes(backend)) throw new Error('Invalid backend');
			const {phpVersion} = JSON.parse(await fs.readFile(path.join(root, '.cache/wasmfs-opfs/build-inputs.json'), 'utf8'));
			data = (await fs.readFile(file, 'utf8')).replaceAll('BENCH_BACKEND', backend).replaceAll('BENCH_VERSION', phpVersion);
		}
		else if(relative === 'staged/PhpCgiBase.mjs') data = await adaptedCgi();
		else if(relative === 'diagnostic-legacy/PhpCgiWebBase.mjs')
		{
			const {sourceCommit} = JSON.parse(await fs.readFile(path.join(root, '.cache/wasmfs-opfs/build-inputs.json'), 'utf8'));
			data = execFileSync('git', ['show', `${sourceCommit}:source/PhpCgiWebBase.mjs`], {cwd: root, encoding: 'utf8'}).replaceAll("from './", "from '../staged/");
		}
		else
		{
			if(relative.startsWith('staged/')) file = path.join(root, 'source', relative.slice(7));
			if(relative.startsWith('artifacts/')) file = path.join(root, '.cache/wasmfs-opfs', relative);
			if(relative.startsWith('backups/')) file = path.join(root, 'demo-web/public', relative);
			data = await fs.readFile(file);
		}
		response.writeHead(200, {
			'Content-Type': types[path.extname(file)] ?? 'application/octet-stream'
			, 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-store'
		});
		response.end(data);
	}
	catch(error)
	{
		response.writeHead(500, {'Content-Type': 'text/plain'}).end(String(error));
	}
});

server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/bench/index.html`));
for(const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
