import Native from './artifacts/BENCH_BACKEND/packages/php-cgi-wasm/phpBENCH_VERSION-cgi-worker.mjs';
import {BenchmarkCgi} from './runtime.mjs';
import {frameworks} from './frameworks.mjs';

const backend = 'BENCH_BACKEND';
let php;
let framework;
let lastRequest;
let queue = Promise.resolve();

/**
 * Starts CGI against one existing demo's document root.
 * @param {string} id Framework identifier.
 * @returns {Promise<object>} Native startup phases.
 */
async function start(id)
{
	framework = frameworks.find(item => item.id === id);
	if(!framework) throw new Error(`Unknown framework: ${id}`);
	php = new BenchmarkCgi(Promise.resolve({default: Native}), {
		backend
		, version: 'BENCH_VERSION'
		, docroot: '/preload'
		, prefix: '/php-wasm/cgi-bin/'
		, staticCacheTime: -1, maxRequestAge: -1
		, vHosts: [{
			pathPrefix: `/php-wasm/cgi-bin/${framework.id}/`
			, directory: `/persist/${framework.directory}/${framework.root}`.replace(/\/$/, '')
			, entrypoint: 'index.php'
		}]
		, types: {css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', ico: 'image/x-icon', png: 'image/png'}
	});
	await php.binary;
	return {...php.startup, heapBytes: (await php.binary).HEAPU8.byteLength};
}

/**
 * Runs a real CGI request, retaining errors and phase timing.
 * @param {Request} request Incoming or synthetic browser request.
 * @returns {Promise<Response>} PHP response.
 */
async function request(request)
{
	const started = performance.now();
	const response = await php.request(request);
	lastRequest = {
		url: request.url, status: response.status, cgiMs: performance.now() - started
		, flushMs: php.lastFlushMs ?? 0
		, stderr: new TextDecoder().decode(new Uint8Array(php.error))
		, heapBytes: (await php.binary).HEAPU8.byteLength
	};
	return response;
}

/**
 * Restores the exact demo zip through PHP CGI, then durably flushes it.
 * @returns {Promise<object>} Download and restore timings.
 */
async function install()
{
	const downloadStart = performance.now();
	const response = await fetch(`./backups/${framework.archive}`);
	if(!response.ok) throw new Error(`Archive HTTP ${response.status}`);
	const archive = new Uint8Array(await response.arrayBuffer());
	const downloadMs = performance.now() - downloadStart;
	const runtime = await php.binary;
	const fs = runtime.benchmarkFS;
	const installStart = performance.now();
	await fs.writeFile('/persist/restore.zip', archive);
	await php._afterRequest(runtime);
	const archiveWriteMs = performance.now() - installStart;
	await fs.writeFile('/preload/install.php', `<?php
header('Content-Type: application/json');
set_time_limit(0);
$destination = '/persist/${framework.directory}';
if(!is_dir($destination) && !mkdir($destination, 0777, true)) throw new Exception('mkdir failed');
$zip = new ZipArchive;
$opened = $zip->open('/persist/restore.zip', ZipArchive::RDONLY);
if($opened !== true) throw new Exception('zip open: ' . $opened);
$count = $zip->count();
for($i = 0; $i < $count; ++$i) {
    $name = $zip->getNameIndex($i);
    if(!$zip->extractTo($destination, $name)) throw new Exception('extract: ' . $name);
}
$zip->close();
unlink('/persist/restore.zip');
echo json_encode(['files' => $count, 'php' => PHP_VERSION]);
`);
	const extractStart = performance.now();
	const installed = await request(new Request(new URL('/php-wasm/cgi-bin/install.php', location.href)));
	const text = await installed.text();
	if(installed.status !== 200) throw new Error(`Install HTTP ${installed.status}: ${text.slice(0, 2000)}`);
	let details;
	try
	{ details = JSON.parse(text); }
	catch
	{ throw new Error(`Invalid install output: ${text.slice(0, 2000)}; stderr: ${lastRequest.stderr}`); }
	return {downloadMs, archiveBytes: archive.length, archiveWriteMs, extractAndFlushMs: performance.now() - extractStart, installMs: performance.now() - installStart, details, ...lastRequest};
}

/**
 * Dispatches a benchmark control operation.
 * @param {object} message Command and parameters.
 * @param {string} message.action Control operation.
 * @param {string} [message.id] Framework identifier for startup.
 * @returns {Promise<unknown>} Serializable result.
 */
async function command({action, id})
{
	if(action === 'start') return start(id);
	if(action === 'install') return install();
	if(action === 'lastRequest') return lastRequest;
	if(action === 'probe')
	{
		const runtime = await php.binary;
		await runtime.benchmarkFS.writeFile('/preload/bytes.php', "<?php header('Content-Type: application/octet-stream'); echo hex2bin('00017f80ff0d0a');");
		const response = await request(new Request(new URL('/php-wasm/cgi-bin/bytes.php', location.href)));
		const bytes = [...new Uint8Array(await response.arrayBuffer())];
		if(response.status !== 200 || JSON.stringify(bytes) !== '[0,1,127,128,255,13,10]')
		{
			throw new Error(`CGI byte preservation failed: ${response.status} ${JSON.stringify(bytes)}`);
		}
		return {bytes, status: response.status};
	}
	if(action === 'info')
	{
		const runtime = await php.binary;
		return {backend, startup: php.startup, heapBytes: runtime.HEAPU8.byteLength};
	}
	throw new Error(`Unknown command: ${action}`);
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
	if(new URL(event.request.url).pathname.startsWith('/php-wasm/cgi-bin/'))
	{
		event.respondWith(request(event.request));
	}
});
self.addEventListener('message', event => {
	const pending = queue.then(() => command(event.data));
	queue = pending.catch(() => {});
	event.waitUntil(pending.then(
		result => event.ports[0].postMessage({result})
		, error => event.ports[0].postMessage({error: {message: error.message, stack: error.stack}})
	));
});
