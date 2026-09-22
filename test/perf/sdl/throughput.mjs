import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, access} from 'node:fs/promises';
import {cpus, loadavg, platform, release} from 'node:os';
import {resolve, join} from 'node:path';
import {chromium} from '@playwright/test';
import {getPlaywrightLaunchOptions} from '../../lib/playwright-browser.mjs';

const [directory, output] = process.argv.slice(2);
assert.ok(output, 'Usage: node test/perf/sdl/throughput.mjs artifact-directory output.json');
await assert.rejects(access(output), {code: 'ENOENT'}, 'Use a new output path to preserve previous measurements');
process.env.PHP_VERSION ??= '8.4';
process.env.PHP_VARIANT = '_sdl';
process.env.LIB_TYPE ??= 'static';
process.env.SDL_TEST_ARTIFACT_DIR = resolve(directory);
const {start, run, allocationStats} = await import('../../browser/lib/sdl-bindings.mjs');
const fixtures = ['instancing', 'uniforms', 'textures-gl', 'textures-sdl', 'events'];
const sampleCount = 12;
const warmupCount = 4;

/**
 * Record the exact build and fixture bytes used in a measurement.
 * @param {string|URL} path Input filename.
 * @returns {Promise<object>} Size and SHA-256 digest.
 */
const fingerprint = async path => {
	const bytes = await readFile(path);
	return {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
};

/**
 * Interpolate a percentile without rounding the retained measurements.
 * @param {number[]} samples Observed values.
 * @param {number} fraction Percentile in [0, 1].
 * @returns {number} Interpolated value.
 */
const percentile = (samples, fraction) => {
	const values = [...samples].sort((a, b) => a - b);
	const position = (values.length - 1) * fraction;
	const index = Math.floor(position);
	return values[index] + (values[Math.ceil(position)] - values[index]) * (position - index);
};

/**
 * Collect accounting outside timing; V8 GC does not free live native owners.
 * @param {import('@playwright/test').Page} page Idle runtime page.
 * @param {import('@playwright/test').CDPSession} session Chromium metrics session.
 * @returns {Promise<object>} Native and JavaScript memory accounting.
 */
const memory = async (page, session) => {
	await session.send('HeapProfiler.collectGarbage');
	const metrics = await session.send('Performance.getMetrics');
	return {
		...await allocationStats(page)
		, jsHeapUsedBytes: metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null
	};
};

const hashes = {};
for(const name of [`php${process.env.PHP_VERSION}_sdl-web.mjs`, `php${process.env.PHP_VERSION}_sdl-web.mjs.wasm`, 'php.data'])
{
	hashes[name] = await fingerprint(join(directory, name));
}
const sources = {};
const sourceHashes = {};
for(const name of ['common', ...fixtures])
{
	const path = new URL(`./${name}.php`, import.meta.url);
	sources[name] = (await readFile(path, 'utf8')).replace(/^<\?php\s*/, '');
	sourceHashes[`${name}.php`] = await fingerprint(path);
}
sourceHashes['throughput.mjs'] = await fingerprint(new URL(import.meta.url));
const {headless, launchOptions} = getPlaywrightLaunchOptions();
const report = {
	date: new Date().toISOString()
	, status: 'running'
	, artifactDirectory: resolve(directory)
	, hashes
	, sourceHashes
	, sourceCommit: process.env.SDL_SOURCE_COMMIT ?? null
	, phpVersion: process.env.PHP_VERSION
	, profile: process.env.LIB_TYPE
	, sampleCount
	, warmupCount
	, machine: {os: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length}
	, loadBefore: loadavg(), launch: {headless, ...launchOptions}, suites: {}
	, notes: [
		'Run twice with native builds, compression and other browser tests idle.'
		, 'Prepared PHP inputs exclude array/string packing, resource creation and shader compilation.'
		, 'Timings include PHP loops, checked bindings, native execution and driver work; they are not pure call overhead.'
		, 'Submission is followed by full framebuffer readback; verification occurs after the native timer stops.'
		, 'Each timed sample repeats its batch, with completion amortized over all batches; this is not game FPS.'
		, 'frameIntervalMs uses performance.now inside rAF callbacks before/after the whole sample, including dispatch and scheduling.'
		, 'Zero submission samples are below the SDL clock resolution, not free calls; rates for a zero median are null.'
		, 'Event timings include queue push/poll and per-event PHP payload checks; they do not measure physical input latency.'
		, 'Instancing uses preloaded offsets; ordinary draws update an offset uniform for each triangle.'
		, 'Uniform paths update the same 64 vec4 values and draw; texture paths alternate 256x256 RGBA uploads and draw.'
		, 'Headless SwiftShader results describe this software renderer, not hardware GPU performance.'
		, 'Native liveBytes is dlmalloc uordblks including the temporary 40-byte mallinfo allocation.'
		, 'Reserved/Wasm capacity and V8 heap size are not live SDL allocations or proof of general leak freedom.'
	]
};
const browser = await chromium.launch({headless, ...launchOptions});
report.browser = browser.version();

try
{
	for(const fixture of fixtures)
	{
		console.log(`Starting ${fixture}`);
		const page = await browser.newPage({baseURL: `http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/`});
		// Route ICU as well as the matching native pair; avoid implicit local outputs.
		await page.route('**/php.data', route => route.fulfill({path: join(resolve(directory), 'php.data'), contentType: 'application/octet-stream'}));
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		const session = await page.context().newCDPSession(page);
		await session.send('Performance.enable');
		await start(page);
		const suite = report.suites[fixture] = {memory: [], samples: {}, summary: {}};
		suite.memory.push({step: 'initial', ...await memory(page, session)});
		const metadata = await run(page, sources.common + '\n' + sources[fixture] + `
		$metadata = [];
		foreach($cases as $name => $case) {
			$metadata[$name] = array_intersect_key($case, array_flip(['batches','itemsPerBatch','callsPerBatch','bytesPerBatch']));
		}
		echo json_encode(['cases'=>$metadata, 'phpVersion'=>PHP_VERSION, 'counterFrequency'=>SDL_GetPerformanceFrequency()]);
		`);
		suite.phpVersion = metadata.phpVersion;
		suite.counterFrequency = metadata.counterFrequency;
		suite.cases = metadata.cases;
		const names = Object.keys(suite.cases);
		for(const name of names)
		{
			assert.match(name, /^[a-z_0-9]+$/);
			suite.samples[name] = [];
			for(let warm = 0; warm < warmupCount; warm++)
			{
				await run(page, `perfMeasure('${name}');`);
			}
		}
		suite.memory.push({step: 'warm', ...await memory(page, session)});
		suite.graphics = fixture === 'events' ? null : await page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
			const debug = gl?.getExtension('WEBGL_debug_renderer_info');
			return gl ? {
				version: gl.getParameter(gl.VERSION)
				, renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)
			} : null;
		});
		for(let round = 0; round < sampleCount; round++)
		{
			for(let offset = 0; offset < names.length; offset++)
			{
				const name = names[(round + offset) % names.length];
				const sample = await page.evaluate(async name => {
					const beforeFrame = await new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
					window.bindingOutput = window.bindingErrors = '';
					const requestStart = performance.now();
					const status = await window.bindingPhp.run(`<?php echo json_encode(perfMeasure('${name}'));`);
					const requestMs = performance.now() - requestStart;
					const afterFrame = await new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
					return {status, output: window.bindingOutput, errors: window.bindingErrors, frameIntervalMs: afterFrame - beforeFrame, requestMs};
				}, name);
				assert.equal(sample.status, 0);
				assert.equal(sample.errors, '');
				const timing = JSON.parse(sample.output);
				for(const value of Object.values(timing))
				{ assert.ok(Number.isFinite(value) && value >= 0); }
				assert.ok(sample.frameIntervalMs >= sample.requestMs, 'Frame callback interval must include request execution');
				assert.ok(sample.requestMs + 2 >= timing.totalMs, 'Browser wall clock must cover the native sample');
				suite.samples[name].push({...timing, frameIntervalMs: sample.frameIntervalMs, requestMs: sample.requestMs});
			}
			if((round + 1) % 4 === 0)
			{
				suite.memory.push({step: `round-${round + 1}`, ...await memory(page, session)});
			}
		}
		for(const [name, samples] of Object.entries(suite.samples))
		{
			const {batches, itemsPerBatch, callsPerBatch, bytesPerBatch} = suite.cases[name];
			const submitMs = percentile(samples.map(sample => sample.submitMs), .5) / batches;
			const totalMs = percentile(samples.map(sample => sample.totalMs), .5) / batches;
			suite.summary[name] = {
				submitMs
				, totalMs
				, finishMs: percentile(samples.map(sample => sample.finishMs), .5) / batches
				, itemsPerSecond: totalMs > 0 ? itemsPerBatch * 1000 / totalMs : null
				, submissionCallsPerSecond: submitMs > 0 ? callsPerBatch * 1000 / submitMs : null
				, uploadMiBPerSecond: bytesPerBatch && totalMs > 0 ? bytesPerBatch / 1048576 * 1000 / totalMs : null
				, sampleFrameIntervalMedianMs: percentile(samples.map(sample => sample.frameIntervalMs), .5)
				, sampleFrameIntervalP95Ms: percentile(samples.map(sample => sample.frameIntervalMs), .95)
				, zeroSubmissionSamples: samples.filter(sample => sample.submitMs === 0).length
			};
		}
		await run(page, '$cleanup(); unset($cases,$cleanup); gc_collect_cycles();');
		suite.memory.push({step: 'cleanup', ...await memory(page, session)});
		await page.evaluate(() => window.bindingPhp.refresh());
		suite.memory.push({step: 'refresh', ...await memory(page, session)});
		assert.deepEqual(errors, []);
		await page.close();
		console.log(JSON.stringify({fixture, summary: suite.summary, memory: suite.memory}));
	}
	for(const [name, hash] of Object.entries(hashes))
	{
		assert.deepEqual(await fingerprint(join(directory, name)), hash, `Artifact changed during benchmark: ${name}`);
	}
	for(const [name, hash] of Object.entries(sourceHashes))
	{
		assert.deepEqual(await fingerprint(new URL(`./${name}`, import.meta.url)), hash, `Fixture changed during benchmark: ${name}`);
	}
	report.status = 'passed';
}
catch(error)
{
	report.status = 'failed';
	report.error = error.stack;
	throw error;
}
finally
{
	report.loadAfter = loadavg();
	await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
	await browser.close();
}
