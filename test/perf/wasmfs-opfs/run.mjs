import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {frameworks} from './frameworks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const backend = process.argv[2] ?? 'idbfs';
const selection = process.argv[3] ?? 'drupal';
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
const firstRound = Number(process.env.BENCH_FIRST_ROUND ?? 0);
const samples = Number(process.env.BENCH_SAMPLES ?? 20);
const timeout = Number(process.env.BENCH_TIMEOUT_MS ?? 600000);
const origin = `http://127.0.0.1:${process.env.BENCH_PORT ?? 9024}`;
const output = path.resolve(root, process.env.BENCH_OUTPUT_DIR ?? '.cache/wasmfs-opfs/results');
await fs.mkdir(output, {recursive: true});
const launchOptions = {
	headless: true
	, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/ms-playwright/chromium-1217/chrome-linux64/chrome'
	, args: ['--no-sandbox', '--disable-gpu']
};
const contexts = new Set();
const selected = frameworks.filter(item => selection === 'all' || selection.split(',').includes(item.id));
if(!['idbfs', 'opfs'].includes(backend) || !selected.length) throw new Error('Expected idbfs/opfs and at least one known framework');
if(!Number.isInteger(rounds) || rounds < 1 || !Number.isInteger(samples) || samples < 1) throw new Error('Rounds and samples must be positive integers');
const {phpVersion, sourceCommit} = JSON.parse(await fs.readFile(path.join(root, '.cache/wasmfs-opfs/build-inputs.json'), 'utf8'));
const binaries = [];
for(const name of [`php${phpVersion}-cgi-worker.mjs`, `php${phpVersion}-cgi-worker.mjs.wasm`, 'php.data'])
{
	const bytes = await fs.readFile(path.join(root, '.cache/wasmfs-opfs/artifacts', backend, 'packages/php-cgi-wasm', name));
	binaries.push({name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}

/**
 * Calls a service-worker command with a deadline that retains failed trials.
 * @param {object} page Playwright page.
 * @param {object} message Serializable benchmark command.
 * @returns {Promise<unknown>} Worker result.
 */
function rpc(page, message)
{
	return page.evaluate(({message, timeout}) => new Promise((resolve, reject) => {
		const channel = new MessageChannel();
		const timer = setTimeout(() => {
			channel.port1.close();
			reject(new Error(`Benchmark RPC timed out: ${message.action}`));
		}, timeout);
		channel.port1.onmessage = event => {
			clearTimeout(timer);
			channel.port1.close();
			if(event.data.error) reject(new Error(event.data.error.message + '\n' + event.data.error.stack));
			else resolve(event.data.result);
		};
		navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
	}), {message, timeout});
}

/**
 * Measures a browser fetch and checks the actual page body, status and stderr.
 * @param {object} page Browser page.
 * @param {object} framework Expected demo metadata.
 * @param {string} [suffix] Path under the framework's CGI route.
 * @returns {Promise<object>} Request sample and correctness evidence.
 */
async function measure(page, framework, suffix = '')
{
	const result = await page.evaluate(async ({url, timeout}) => {
		const started = performance.now();
		const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(timeout)});
		const bytes = new Uint8Array(await response.arrayBuffer());
		const wallMs = performance.now() - started;
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
		return {
			wallMs
			, status: response.status
			, url: response.url
			, bytes: bytes.length, body: new TextDecoder().decode(bytes)
			, bodySha256: [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
		};
	}, {url: `${origin}/php-wasm/cgi-bin/${framework.id}/${suffix}`, timeout});
	const native = await rpc(page, {action: 'lastRequest'});
	const fatal = /PHP (?:Fatal error|Parse error)|Uncaught \w+Error/i.test(native?.stderr ?? '') || /<b>(?:Fatal error|Parse error)<\/b>/i.test(result.body);
	const valid = !fatal && result.status === 200 && (suffix ? result.bodySha256 === framework.assetSha256 : result.body.includes(framework.marker));
	const sample = {...native, ...result, body: undefined, valid};
	if(!valid)
	{
		await fs.writeFile(path.join(output, `${backend}-${framework.id}-failure.html`), result.body);
		throw Object.assign(new Error(`Invalid framework response: HTTP ${result.status}, ${framework.id}, ${result.body.slice(0, 400)}`), {sample});
	}
	return sample;
}

try
{
	for(const framework of selected)
	{
		const archivePath = path.join(root, 'demo-web/public/backups', framework.archive);
		const archive = await fs.readFile(archivePath);
		const asset = execFileSync('unzip', ['-p', archivePath, [framework.root, framework.asset].filter(Boolean).join('/')]);
		framework.assetSha256 = createHash('sha256').update(asset).digest('hex');
		const archiveInput = {name: framework.archive, bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex')};
		for(let round = firstRound; round < firstRound + rounds; round++)
		{
			const profile = path.join(root, '.cache/wasmfs-opfs/profiles', `${backend}-${framework.id}-${round}`);
			await fs.rm(profile, {recursive: true, force: true});
			const context = await chromium.launchPersistentContext(profile, launchOptions);
			contexts.add(context);
			const trial = {
				backend, framework: framework.id, name: framework.name, round
				, runLabel: process.env.BENCH_RUN_LABEL ?? path.basename(output)
				, hostPreflight: process.env.BENCH_PREFLIGHT ? JSON.parse(process.env.BENCH_PREFLIGHT) : undefined
				, archive: archiveInput, assetSha256: framework.assetSha256
				, phpVersion, sourceCommit, binaries
				, browser: context.browser().version(), profileMode: 'persistent'
				, platform: {os: os.release(), arch: os.arch(), cpu: os.cpus()[0].model, parallelism: os.availableParallelism(), loadAverage: os.loadavg()}
				, started: new Date().toISOString(), samples: [], assets: [], errors: []
			};
			const page = context.pages()[0] ?? await context.newPage();
			page.setDefaultTimeout(timeout);
			page.on('pageerror', error => trial.errors.push(String(error)));
			context.on('console', message => {
				if(message.type() === 'error')
				{
					trial.errors.push(message.text());
					console.error(JSON.stringify({event: 'browser-error', backend, framework: framework.id, message: message.text()}));
				}
			});
			const file = path.join(output, `${backend}-${framework.id}-${round}.json`);
			const save = () => fs.writeFile(file, JSON.stringify(trial, null, 2) + '\n');
			console.log(JSON.stringify({event: 'start', backend, framework: framework.id, round}));
			try
			{
				await page.goto(`${origin}/bench/index.html`);
				const workerStarted = performance.now();
				await page.evaluate(async ({backend, timeout}) => {
					await Promise.race([
						(async () => {
							await navigator.serviceWorker.register(`/bench/worker.mjs?backend=${backend}`, {type: 'module', scope: '/'});
							await navigator.serviceWorker.ready;
							if(!navigator.serviceWorker.controller)
							{
								await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
							}
						})()
						, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Service-worker registration timed out')), timeout))
					]);
				}, {backend, timeout});
				trial.startup = await rpc(page, {action: 'start', id: framework.id});
				trial.workerStartMs = performance.now() - workerStarted;
				await save();
				console.log(JSON.stringify({event: 'ready', backend, framework: framework.id, startup: trial.startup}));
				if(process.env.BENCH_PROBE) trial.probe = await rpc(page, {action: 'probe'});
				trial.install = await rpc(page, {action: 'install'});
				await save();
				console.log(JSON.stringify({event: 'installed', backend, framework: framework.id, installMs: trial.install.installMs}));
				trial.first = await measure(page, framework);
				await save();
				console.log(JSON.stringify({event: 'first', backend, framework: framework.id, wallMs: trial.first.wallMs}));
				for(let index = 0; index < samples; index++)
				{
					trial.samples.push(await measure(page, framework));
					await save();
					if((index + 1) % 5 === 0) console.log(JSON.stringify({event: 'samples', backend, framework: framework.id, count: index + 1}));
				}
				for(let index = 0; index < 5; index++) trial.assets.push(await measure(page, framework, framework.asset));
				const navigationStarted = performance.now();
				await page.goto(`${origin}/php-wasm/cgi-bin/${framework.id}/`, {waitUntil: 'load'});
				trial.render = await page.evaluate(() => ({
					title: document.title
					, text: document.body.innerText
					, images: [...document.images].map(image => ({url: image.src, complete: image.complete, width: image.naturalWidth}))
				}));
				trial.render.wallMs = performance.now() - navigationStarted;
				if(!trial.render.text.includes(framework.marker)) throw new Error(`Rendered ${framework.id} page is missing its expected text`);
				if(round === 0) await page.screenshot({path: path.join(output, `${backend}-${framework.id}.png`)});
				await save();
				// Stop the worker, keeping this browser context's durable storage. A
				// subsequent registration starts with a new Wasm heap and module state.
				const cdp = await context.newCDPSession(page);
				await cdp.send('ServiceWorker.enable');
				await cdp.send('ServiceWorker.stopAllWorkers');
				await cdp.detach();
				const restartStarted = performance.now();
				trial.restart = await rpc(page, {action: 'start', id: framework.id});
				trial.restartWorkerMs = performance.now() - restartStarted;
				trial.afterRestart = await measure(page, framework);
				trial.complete = true;
				console.log(JSON.stringify({event: 'complete', backend, framework: framework.id, round, firstMs: trial.first.wallMs, samples: trial.samples.length, restartMs: trial.restart.totalMs}));
			}
			catch(error)
			{
				trial.failure = {message: error.message, stack: error.stack, sample: error.sample};
				console.error(JSON.stringify({event: 'failure', backend, framework: framework.id, round, failure: trial.failure}));
				process.exitCode = 1;
			}
			finally
			{
				trial.finished = new Date().toISOString();
				await save();
				await context.close();
				contexts.delete(context);
				await fs.rm(profile, {recursive: true, force: true});
			}
		}
	}
}
finally
{ for(const context of contexts) await context.close(); }
