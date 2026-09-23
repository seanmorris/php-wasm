import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {cpus, loadavg, platform, release} from 'node:os';
import {chromium} from '@playwright/test';
import {getPlaywrightLaunchOptions} from '../../lib/playwright-browser.mjs';

const output = process.argv[2];
assert.ok(output, 'Usage: node test/perf/sdl/run.mjs output.json (start test/browser/server.mjs first)');
const version = process.env.PHP_VERSION ?? '8.4';
const libType = process.env.LIB_TYPE ?? 'static';
const source = await readFile(new URL('./draw.php', import.meta.url), 'utf8');
process.env.PHP_VARIANT = '_sdl';
const {headless, launchOptions} = getPlaywrightLaunchOptions();
const machine = {os: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length};
const loadBefore = loadavg();
const browser = await chromium.launch({headless, ...launchOptions});

try
{
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/harness/index.html`);
	const result = await page.evaluate(async ({version, libType, source}) => {
		document.body.innerHTML = '<canvas width="128" height="128"></canvas>';
		const {PhpSdl} = await import(`/packages/php-sdl-wasm/php${version}-sdl.mjs`);
		const canvas = document.querySelector('canvas');
		const php = new PhpSdl({canvas});
		let stdout = '', stderr = '';
		php.addEventListener('output', event => stdout += event.detail.join(''));
		php.addEventListener('error', event => stderr += event.detail.join(''));
		const module = await php.binary;
		const beforeHeap = module.HEAPU8?.byteLength ?? null;
		const status = await php.run(source);
		const afterHeap = module.HEAPU8?.byteLength ?? null;
		const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
		const debug = gl?.getExtension('WEBGL_debug_renderer_info');
		const graphics = gl ? {
			version: gl.getParameter(gl.VERSION)
			, renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)
		} : null;
		await php.refresh();
		return {status, stdout, stderr, beforeHeap, afterHeap, graphics};
	}, {version, libType, source});
	assert.deepEqual(errors, []);
	assert.equal(result.stderr, '');
	assert.equal(result.status, 0);
	const data = JSON.parse(result.stdout);
	const hashes = {};
	const manifest = JSON.parse(await readFile(new URL(`../../../packages/php-sdl-wasm/php${version}-sdl.manifest.json`, import.meta.url)));
	for(const name of manifest.files.map(file => file.path))
	{
		const bytes = await readFile(new URL(`../../../packages/php-sdl-wasm/${name}`, import.meta.url));
		hashes[name] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
	}
	const medians = Object.fromEntries(Object.entries(data.samples).map(([name, samples]) => [
		name
		, Object.fromEntries(['submitMs', 'flushMs', 'totalMs'].map(metric => {
			const values = samples.map(sample => sample[metric]).sort((a, b) => a - b);
			return [metric, (values[5] + values[6]) / (2 * data.batchesPerSample)];
		}))
	]));
	await writeFile(output, JSON.stringify({
		date: new Date().toISOString(), browser: browser.version(), libType, hashes
		, machine, loadBefore, loadAfter: loadavg()
		, graphics: result.graphics, launch: {headless, args: launchOptions.args}
		, ...data, medians
		, ...data, heapBytesBefore: result.beforeHeap
		, ...data, heapBytesAfter: result.afterHeap
		, notes: [
			'Prepared inputs: object/array construction and packing occur before measurement.'
			, 'Each raw sample repeats 64 batches to exceed the SDL clock granularity; medians are normalized per 1024 rectangles.'
			, 'Submission includes PHP/native calls and SDL queueing. Readback forces completion separately.'
			, 'Completion is amortized across the repeated draws; it is not an individual frame measurement.'
			, 'Headless browser results describe this machine and renderer, not hardware GPU performance.'
			, 'Memory samples include retained result arrays and allocator caches; they are not a leak test.'
			, 'Zero PHP memory readings mean allocator accounting is unavailable in this build.'
		]
	}, null, 2) + '\n');
	console.log(JSON.stringify(medians, null, 2));
}
finally
{
	await browser.close();
}
