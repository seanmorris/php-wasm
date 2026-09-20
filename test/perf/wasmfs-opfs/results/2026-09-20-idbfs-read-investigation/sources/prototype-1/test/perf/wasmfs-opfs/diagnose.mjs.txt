import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {frameworks} from './frameworks.mjs';

const backend = process.argv[2] ?? 'idbfs';
const id = process.argv[3] ?? 'drupal';
const mode = process.argv[4] ?? 'original';
const round = Number(process.env.BENCH_FIRST_ROUND ?? 0);
const framework = frameworks.find(item => item.id === id);
if(!framework || !['idbfs', 'opfs'].includes(backend) || !['original', 'memory-archive', 'buffer-files', 'incremental-idbfs', 'grouped-idbfs'].includes(mode)) throw new Error('Unknown backend, framework or diagnostic mode');
const incremental = ['incremental-idbfs', 'grouped-idbfs'].includes(mode);
if(incremental && backend !== 'idbfs') throw new Error('The incremental IDBFS modes require the IDBFS backend');
const directory = path.resolve('.cache/wasmfs-opfs/diagnostics');
await fs.mkdir(directory, {recursive: true});
const file = path.join(directory, `${backend}-${id}-${mode}-${round}.json`);
try
{
	await fs.access(file);
	throw new Error(`Existing diagnostic result: ${file}`);
}
catch(error)
{ if(error.code !== 'ENOENT') throw error; }
const browserProfile = path.join(directory, 'profiles', `${backend}-${id}-${mode}-${round}`);
const context = await chromium.launchPersistentContext(browserProfile, {
	headless: true
	, executablePath: '/ms-playwright/chromium-1217/chrome-linux64/chrome'
	, args: ['--no-sandbox', '--disable-gpu']
});
const result = {backend, framework: id, mode, round, started: new Date().toISOString(), browser: context.browser().version(), loadAverage: os.loadavg(), measurements: [], errors: []};
const save = () => fs.writeFile(file, JSON.stringify(result, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

try
{
	const page = context.pages()[0];
	const diagnosticCdp = await context.newCDPSession(page);
	diagnosticCdp.on('ServiceWorker.workerErrorReported', event => result.errors.push(event));
	await diagnosticCdp.send('ServiceWorker.enable');
	context.on('console', message => { if(message.type() === 'error') result.errors.push(message.text()); });
	page.on('pageerror', error => result.errors.push(error.message));
	await page.goto('http://127.0.0.1:9024/bench/index.html');
	await page.evaluate(async backend => {
		await navigator.serviceWorker.register(`/bench/diagnostic-worker.mjs?backend=${backend}`, {type: 'module', scope: '/'});
		await navigator.serviceWorker.ready;
		if(!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
	}, backend);
	const call = message => page.evaluate(message => new Promise((resolve, reject) => {
		const channel = new MessageChannel();
		const timer = setTimeout(() => reject(new Error(`Diagnostic timeout: ${message.action}`)), 600000);
		channel.port1.onmessage = event => {
			clearTimeout(timer);
			channel.port1.close();
			if(event.data.error) reject(new Error(event.data.error.message + '\n' + event.data.error.stack));
			else resolve(event.data.result);
		};
		navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
	}), message);
	const archive = await fs.readFile(path.resolve('demo-web/public/backups', framework.archive));
	result.archiveSha256 = hash(archive);
	result.inputs = [];
	for(const file of [
		`test/perf/wasmfs-opfs/diagnostic-worker.mjs`
		, `test/perf/wasmfs-opfs/diagnostic-instrumentation.mjs`
		, 'test/perf/wasmfs-opfs/diagnose.mjs', 'source/PhpCgiWebBase.mjs'
		, 'source/idbfsSync.mjs'
		, ...['mjs', 'mjs.wasm'].map(extension => `.cache/wasmfs-opfs/artifacts/${backend}/packages/php-cgi-wasm/php8.3-cgi-worker.${extension}`)
	]){
		const bytes = await fs.readFile(file);
		result.inputs.push({file, bytes: bytes.length, sha256: hash(bytes)});
	}
	const archivePath = path.resolve('demo-web/public/backups', framework.archive);
	const largest = execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(max((i for i in z.infolist() if i.filename.endswith((".php",".js",".css"))),key=lambda i:i.file_size).filename)', archivePath], {encoding: 'utf8'}).trim();
	const expectedFiles = [...new Set([largest, ...['index.php', framework.asset].map(file => [framework.root, file].filter(Boolean).join('/'))])].map(file => {
		const bytes = execFileSync('unzip', ['-p', archivePath, file], {maxBuffer: 128 * 1024 * 1024});
		return {path: `/persist/${framework.directory}/${file}`, bytes: bytes.length, sha256: hash(bytes)};
	});
	result.expectedFiles = expectedFiles;
	result.startup = await call({action: 'start', id, incremental});
	await save();
	console.log(JSON.stringify({event: 'ready', backend, id, mode}));
	result.restore = await call({action: 'restore', memoryArchive: ['memory-archive', 'buffer-files'].includes(mode), bufferFiles: mode === 'buffer-files'});
	await save();
	console.log(JSON.stringify({event: 'restored', backend, id, mode, ms: result.restore.restoreMs}));
	result.first = await call({action: 'page', name: 'first'});
	await save();
	for(let index = 0; index < 6; index++)
	{
		result.measurements.push(await call({action: 'page', name: `warm-${index}`}));
		await save();
	}
	if(backend === 'idbfs')
	{
		for(let index = 0; index < 3; index++) result.measurements.push(await call({action: 'sync', name: `noop-sync-${index}`}));
		for(const batched of [false, true]) result.measurements.push(await call({action: 'rpc-reads', batched, count: 8}));
		await save();
		if(mode === 'grouped-idbfs')
		{
			for(let index = 0; index < 6; index++) result.measurements.push(await call({action: 'hydrate', name: `cursor-hydrate-${index}`}));
			result.remoteEquivalence = await call({action: 'grouped-remote-scan'});
			for(let index = 0; index < 6; index++) result.measurements.push(await call({action: 'hydrate', name: `grouped-hydrate-${index}`}));
			result.measurements.push(await call({action: 'rpc-reads', batched: true, count: 8, suffix: '-grouped'}));
			await save();
		}
		if(!incremental)
		{
			await call({action: 'dirty-mode'});
			for(let index = 0; index < 6; index++)
			{
				result.measurements.push(await call({action: 'page', name: `dirty-warm-${index}`}));
				await save();
			}
			result.dirtyInfo = await call({action: 'info'});
			await call({action: 'direct-local-scan'});
			for(let index = 0; index < 6; index++)
			{
				result.measurements.push(await call({action: 'page', name: `direct-scan-warm-${index}`}));
				await save();
			}
			await call({action: 'dirty-mode', incremental: true});
			for(let index = 0; index < 6; index++)
			{
				result.measurements.push(await call({action: 'page', name: `incremental-warm-${index}`}));
				await save();
			}
			result.mutationProbe = await call({action: 'mutation-probe'});
		}
	}
	result.verifiedFiles = await call({action: 'verify-files', paths: expectedFiles.map(file => file.path)});
	if(JSON.stringify(result.verifiedFiles) !== JSON.stringify(expectedFiles)) throw new Error('Restored file bytes differ from ZIP');
	const cdp = await context.newCDPSession(page);
	await cdp.send('ServiceWorker.enable');
	await cdp.send('ServiceWorker.stopAllWorkers');
	await cdp.detach();
	result.restart = await call({action: 'start', id, incremental});
	result.afterRestart = await call({action: 'page', name: 'after-restart'});
	result.verifiedAfterRestart = await call({action: 'verify-files', paths: expectedFiles.map(file => file.path)});
	if(JSON.stringify(result.verifiedAfterRestart) !== JSON.stringify(expectedFiles)) throw new Error('Persisted file bytes differ from ZIP');
	if(result.mutationProbe)
	{
		result.verifiedMutations = await call({action: 'verify-files', paths: result.mutationProbe.files});
		const expected = hash(new Uint8Array(result.mutationProbe.bytes));
		if(result.verifiedMutations.some(file => file.sha256 !== expected)) throw new Error('Persisted mutation bytes differ');
		result.verifiedDeletions = await call({action: 'verify-absent', paths: result.mutationProbe.absent});
		if(result.verifiedDeletions.some(file => file.exists)) throw new Error('Deleted entries reappeared after restart');
	}
	result.complete = true;
	console.log(JSON.stringify({event: 'complete', backend, id, mode}));
}
catch(error)
{
	result.failure = {message: error.message, stack: error.stack};
	process.exitCode = 1;
	console.error(error);
}
finally
{
	result.finished = new Date().toISOString();
	await save();
	await context.close();
	await fs.rm(browserProfile, {recursive: true, force: true});
}
