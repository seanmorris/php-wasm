import assert from 'node:assert/strict';
import {artifactFiles} from './artifacts.mjs';
import {createHash} from 'node:crypto';
import {readFile, writeFile, access} from 'node:fs/promises';
import {cpus, loadavg, platform, release} from 'node:os';
import {resolve, join} from 'node:path';
import {chromium} from '@playwright/test';
import {getPlaywrightLaunchOptions} from '../../lib/playwright-browser.mjs';

const [directory, output] = process.argv.slice(2);
assert.ok(output, 'Usage: node test/perf/sdl/audio.mjs artifact-directory output.json');
await assert.rejects(access(output), {code: 'ENOENT'}, 'Use a new output path');
process.env.PHP_VERSION ??= '8.4';
process.env.PHP_VARIANT = '_sdl';
process.env.LIB_TYPE ??= 'static';
process.env.SDL_TEST_ARTIFACT_DIR = resolve(directory);
const {run, allocationStats} = await import('../../browser/lib/sdl-bindings.mjs');
const {startAudio, primeAudio} = await import('../../browser/lib/sdl-audio.mjs');
const rounds = 4;
const callbacks = 96;
const settleCallbacks = 24;
const cases = [
	{name: 'silence', channels: 0, music: false}
	, ...[1, 8, 32].map(channels => ({name: `channels_${channels}`, channels, music: false}))
	, {name: 'mp3', channels: 0, music: true}
	, {name: 'channels_32_mp3', channels: 32, music: true}
];

/** @param {string|URL} path File used by the run. @returns {Promise<object>} Exact bytes and digest. */
const fingerprint = async path => {
	const bytes = await readFile(path);
	return {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
};

/**
 * @param {number[]} samples Values. @param {number} fraction Quantile. @returns {number} Interpolated quantile.
 * @param fraction
 */
const percentile = (samples, fraction) => {
	const values = [...samples].sort((a, b) => a - b);
	const position = (values.length - 1) * fraction;
	const index = Math.floor(position);
	return values[index] + (values[Math.ceil(position)] - values[index]) * (position - index);
};

/**
 * Observe actual callbacks, after discarding queued output from the prior case.
 * @param {import('@playwright/test').Page} page Live audio page.
 * @returns {Promise<object[]>} Per-callback timings and actual output PCM metrics.
 */
const observe = page => page.evaluate(({callbacks, settleCallbacks}) => new Promise((resolve, reject) => {
	const timer = setTimeout(() => {
		window.audioMeasurement = null;
		reject(new Error('Audio callback measurement timed out'));
	}, 30000);
	window.audioMeasurement = {
		rows: [], skip: settleCallbacks, target: callbacks, lastStarted: null
		, resolve(rows) { clearTimeout(timer); resolve(rows); }
	};
}), {callbacks, settleCallbacks});

const paths = Object.fromEntries([
	...(await artifactFiles(directory, process.env.PHP_VERSION)).map(name => [name, join(directory, name)])
	, ['audio.mjs', new URL(import.meta.url)]
	, ['audio.php', new URL('./audio.php', import.meta.url)]
	, ['sdl-audio.mjs', new URL('../../browser/lib/sdl-audio.mjs', import.meta.url)]
	, ['sdl-bindings.mjs', new URL('../../browser/lib/sdl-bindings.mjs', import.meta.url)]
	, ['WOJTEK3.mp3', new URL('../../../demo-web/public/sdl/WOJTEK3.mp3', import.meta.url)]
]);
const hashes = {};
for(const [name, path] of Object.entries(paths))
{ hashes[name] = await fingerprint(path); }
const {headless, launchOptions} = getPlaywrightLaunchOptions();
const report = {
	date: new Date().toISOString()
	, status: 'running'
	, sourceCommit: process.env.SDL_SOURCE_COMMIT ?? null
	, artifactDirectory: resolve(directory), hashes, profile: process.env.LIB_TYPE
	, rounds
	, callbacks
	, settleCallbacks
	, cases
	, samples: {}
	, summary: {}
	, memory: []
	, machine: {os: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length}
	, loadBefore: loadavg(), launch: {headless, ...launchOptions}
	, notes: [
		'Run twice after native builds, compression and other tests are terminal.'
		, 'Timing wraps the real SDL Web Audio callback, including native mixing, MP3 decode and output conversion/copy.'
		, 'PCM analysis is outside callbackMs but its observer overhead can affect scheduling; PHP setup and allocation are untimed.'
		, 'Each case restarts playback, discards 24 callbacks, then records 96; a full warmup precedes four rotating rounds.'
		, 'All channels loop the same quiet 440 Hz WAV; PCM amplitude ratios verify concurrent channel contributions.'
		, 'MP3 uses Unreal Superhero 3 by Kenët and rez; supplied asset hash is recorded.'
		, 'A callback exceeding buffer duration or an interval over twice that duration is an observation, not proof of an audible underrun.'
		, 'Zero callback durations/intervals are below the browser clock resolution; they do not imply free mixing.'
		, 'Headless Web Audio uses a software output device; this does not establish hardware latency or browser/device parity.'
		, 'Native live bytes and SDL allocation counts cover this prepared mixer fixture; capacity is not a live allocation count.'
	]
};
const browser = await chromium.launch({headless, ...launchOptions});
report.browser = browser.version();
try
{
	const page = await browser.newPage({baseURL: `http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/`});
	await page.route('**/php.data', route => route.fulfill({path: resolve(paths['php.data']), contentType: 'application/octet-stream'}));
	await page.route('**/WOJTEK3.mp3', route => route.fulfill({path: paths['WOJTEK3.mp3'].pathname, contentType: 'audio/mpeg'}));
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	const session = await page.context().newCDPSession(page);
	await session.send('Performance.enable');
	const memory = async step => {
		await session.send('HeapProfiler.collectGarbage');
		const metrics = await session.send('Performance.getMetrics');
		report.memory.push({step, ...await allocationStats(page), jsHeapUsedBytes: metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize').value});
	};
	await startAudio(page, {measure: true});
	await memory('initial');
	const source = (await readFile(paths['audio.php'], 'utf8')).replace(/^<\?php\s*/, '');
	await run(page, source);
	await primeAudio(page);
	report.phpVersion = await run(page, 'echo json_encode(PHP_VERSION);');
	report.device = await page.evaluate(() => window.audioContexts.map(context => ({sampleRate: context.sampleRate, baseLatency: context.baseLatency, outputLatency: context.outputLatency, state: context.state})));
	for(const sample of cases)
	{
		await run(page, `audioStart(${sample.channels},${sample.music});`);
		await observe(page);
		report.samples[sample.name] = [];
	}
	await memory('warm');
	for(let round = 0; round < rounds; round++)
	{
		for(let offset = 0; offset < cases.length; offset++)
		{
			const sample = cases[(round + offset) % cases.length];
			const state = await run(page, `echo json_encode(audioStart(${sample.channels},${sample.music}));`);
			const rows = await observe(page);
			report.samples[sample.name].push({round, state, rows});
			assert.deepEqual(await run(page, `echo json_encode(audioState(${sample.channels},${sample.music}));`), state);
			for(const row of rows)
			{
				assert.ok(row.intervalMs >= 0 && row.callbackMs >= 0 && row.bufferMs > 0);
				assert.equal(row.channels, 2);
				assert.ok(Number.isFinite(row.rms) && row.peak <= 1);
				assert.ok(sample.channels || sample.music ? row.rms > .0001 : row.peak === 0, `${sample.name} PCM mismatch`);
			}
			console.log(`round ${round + 1}: ${sample.name}`);
		}
		// Compare allocations in the same warmed playback state each round.
		await run(page, 'audioStart(32,true); gc_collect_cycles();');
		await observe(page);
		await memory(`round-${round + 1}`);
	}
	for(const sample of cases)
	{
		const rows = report.samples[sample.name].flatMap(sample => sample.rows);
		report.summary[sample.name] = {
			callbackMedianMs: percentile(rows.map(row => row.callbackMs), .5)
			, callbackP95Ms: percentile(rows.map(row => row.callbackMs), .95)
			, callbackMaxMs: Math.max(...rows.map(row => row.callbackMs))
			, intervalMedianMs: percentile(rows.map(row => row.intervalMs), .5)
			, intervalP95Ms: percentile(rows.map(row => row.intervalMs), .95)
			, callbacksOverBufferDuration: rows.filter(row => row.callbackMs > row.bufferMs).length
			, intervalsOverTwoBuffers: rows.filter(row => row.intervalMs > row.bufferMs * 2).length
			, zeroCallbackSamples: rows.filter(row => row.callbackMs === 0).length
			, zeroIntervalSamples: rows.filter(row => row.intervalMs === 0).length
			, bufferMs: rows[0].bufferMs
			, frames: rows[0].frames
			, sampleRate: rows[0].sampleRate
			, rmsMedian: percentile(rows.map(row => row.rms), .5)
		};
	}
	for(const channels of [8, 32])
	{
		const ratio = report.summary[`channels_${channels}`].rmsMedian / report.summary.channels_1.rmsMedian;
		assert.ok(Math.abs(ratio / channels - 1) < .01, `Concurrent PCM contribution mismatch: ${ratio} for ${channels}`);
	}
	const settled = report.memory.filter(sample => sample.step.startsWith('round-'));
	assert.ok(settled.every(sample => sample.sdlAllocations === settled[0].sdlAllocations));
	assert.equal(settled.at(-1).liveBytes, settled.at(-2).liveBytes);
	await run(page, 'audioCleanup(); gc_collect_cycles();');
	await memory('cleanup');
	assert.equal(report.memory.at(-1).sdlAllocations, 0);
	report.cleanup = await page.evaluate(() => ({contexts: window.audioContexts.map(context => context.state), connectedProcessors: window.audioProcessors.filter(processor => processor.connected).length}));
	assert.equal(report.cleanup.connectedProcessors, 0);
	await page.evaluate(() => window.bindingPhp.refresh());
	await memory('refresh');
	assert.deepEqual(errors, []);
	for(const [name, path] of Object.entries(paths))
	{ assert.deepEqual(await fingerprint(path), hashes[name], `Input changed during measurement: ${name}`); }
	report.status = 'passed';
	console.log(JSON.stringify(report.summary));
}
catch(error)
{
	report.status = 'failed'; report.error = error.stack;
	throw error;
}
finally
{
	report.loadAfter = loadavg();
	await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
	await browser.close();
}
