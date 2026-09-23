import assert from 'node:assert/strict';
import {artifactFiles} from './artifacts.mjs';
import {createHash} from 'node:crypto';
import {readFile, writeFile, access} from 'node:fs/promises';
import {cpus, loadavg} from 'node:os';
import {resolve, join} from 'node:path';
import {chromium} from '@playwright/test';
import {getPlaywrightLaunchOptions} from '../../lib/playwright-browser.mjs';

const [directory, output] = process.argv.slice(2);
assert.ok(output, 'Usage: node test/perf/sdl/index-queries.mjs artifact-directory output.json');
await assert.rejects(access(output), {code: 'ENOENT'}, 'Use a new output path');
process.env.PHP_VERSION ??= '8.4';
process.env.PHP_VARIANT = '_sdl';
process.env.LIB_TYPE ??= 'static';
process.env.SDL_TEST_ARTIFACT_DIR = resolve(directory);
const {start, run} = await import('../../browser/lib/sdl-bindings.mjs');
const batches = 4;
const rounds = 6;
const names = ['ordinary_arrays', 'instanced_arrays', 'ordinary_indexed', 'instanced_indexed'];
const modes = ['native', 'observed'];
const paths = Object.fromEntries([
	...(await artifactFiles(directory, process.env.PHP_VERSION)).map(name => [name, join(directory, name)])
	, ...['index-queries.mjs', 'common.php', 'instancing.php'].map(name => [name, new URL(name, import.meta.url)])
	, ['sdl-bindings.mjs', new URL('../../browser/lib/sdl-bindings.mjs', import.meta.url)]
]);

/** @param {string|URL} path Measured input. @returns {Promise<object>} Bytes and digest. */
const fingerprint = async path => {
	const bytes = await readFile(path);
	return {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
};

/** @param {number[]} samples Measured values. @returns {number} Median, retaining all samples. */
const median = samples => {
	const values = [...samples].sort((a, b) => a - b);
	return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
};

const hashes = {};
for(const [name, path] of Object.entries(paths))
{ hashes[name] = await fingerprint(path); }
const sources = await Promise.all(['common.php', 'instancing.php'].map(async name => (await readFile(paths[name], 'utf8')).replace(/^<\?php\s*/, '')));
const {headless, launchOptions} = getPlaywrightLaunchOptions();
const report = {
	date: new Date().toISOString()
	, status: 'running'
	, sourceCommit: process.env.SDL_SOURCE_COMMIT ?? null
	, artifactDirectory: resolve(directory), hashes, profile: process.env.LIB_TYPE
	, batches, rounds, samples: [], summary: {}
	, machine: {cpu: cpus()[0]?.model, logicalCpus: cpus().length}
	, loadBefore: loadavg(), launch: {headless, ...launchOptions}
	, notes: [
		'Run twice after controlled builds, compression and other tests finish.'
		, 'Native mode uses original browser methods; observed mode times the real methods without replacing results or skipping validation.'
		, 'Both modes use the same prepared instancing fixture and full-frame pixel checks, with four repeated batches per sample.'
		, 'Six rotating rounds interleave both modes; each path is warmed before measurement.'
		, 'Observed timings include synchronization with previously queued rendering, not just CPU query cost. Instrumentation adds overhead.'
		, 'Per-call browser clock quantization affects tiny durations; aggregate times and native/observed sample totals are both retained.'
		, 'Software renderer timings do not establish hardware GPU costs or game FPS.'
	]
};
const browser = await chromium.launch({headless, ...launchOptions});
report.browser = browser.version();
try
{
	const page = await browser.newPage({baseURL: `http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/`});
	await page.route('**/php.data', route => route.fulfill({path: resolve(paths['php.data']), contentType: 'application/octet-stream'}));
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await start(page);
	report.phpVersion = await run(page, sources.join('\n') + `
	foreach($cases as &$case) { $case['batches'] = ${batches}; } unset($case);
	echo json_encode(PHP_VERSION);
	`);
	report.graphics = await page.evaluate(() => {
		const gl = document.querySelector('canvas').getContext('webgl2');
		const extension = gl.getExtension('WEBGL_debug_renderer_info');
		const prototype = WebGL2RenderingContext.prototype;
		const methods = ['getParameter', 'getBufferParameter', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
		const originals = Object.fromEntries(methods.map(name => [name, prototype[name]]));
		const wrap = name => function(...args) {
			const selected = name === 'getParameter' ? args[0] === 0x8895
				: name === 'getBufferParameter' ? args[0] === 0x8893 && args[1] === 0x8764 : true;
			if(!selected)
			{ return Reflect.apply(originals[name], this, args); }
			const started = performance.now();
			try
			{ return Reflect.apply(originals[name], this, args); }
			finally
			{
				const row = window.indexQueries[name];
				row.calls++;
				row.elapsedMs += performance.now() - started;
			}
		};
		const observed = Object.fromEntries(methods.map(name => [name, wrap(name)]));
		window.indexMode = mode => {
			window.indexQueries = Object.fromEntries(methods.map(name => [name, {calls: 0, elapsedMs: 0}]));
			Object.assign(prototype, mode === 'observed' ? observed : originals);
		};
		return {version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)};
	});
	for(const mode of modes)
	{
		await page.evaluate(mode => window.indexMode(mode), mode);
		for(const name of names)
		{
			for(let warm = 0; warm < 2; warm++)
			{ await run(page, `perfMeasure('${name}');`); }
		}
	}
	for(let round = 0; round < rounds; round++)
	{
		for(let offset = 0; offset < names.length; offset++)
		{
			const name = names[(round + offset) % names.length];
			for(let index = 0; index < modes.length; index++)
			{
				const mode = modes[(round + index) % modes.length];
				await page.evaluate(mode => window.indexMode(mode), mode);
				const timing = await run(page, `echo json_encode(perfMeasure('${name}'));`);
				const driver = await page.evaluate(() => window.indexQueries);
				if(mode === 'observed')
				{
					const queries = name.endsWith('indexed') ? batches * (name.startsWith('ordinary') ? 1024 : 1) : 0;
					assert.equal(driver.getParameter.calls, queries);
					assert.equal(driver.getBufferParameter.calls, queries);
					const method = name.endsWith('indexed') ? 'drawElements' : 'drawArrays';
					const draw = name.startsWith('instanced') ? method + 'Instanced' : method;
					assert.equal(driver[draw].calls, batches * (name.startsWith('ordinary') ? 1024 : 1));
				}
				report.samples.push({round, name, mode, timing, driver});
			}
		}
		console.log(`round ${round + 1}/${rounds}`);
	}
	for(const name of names)
	{
		report.summary[name] = Object.fromEntries(modes.map(mode => {
			const rows = report.samples.filter(row => row.name === name && row.mode === mode);
			const driver = Object.fromEntries(Object.keys(rows[0].driver).map(method => [
				method, {
					callsPerBatch: rows[0].driver[method].calls / batches
					, medianMsPerBatch: median(rows.map(row => row.driver[method].elapsedMs)) / batches
				}
			]));
			return [mode, {
				submitMsPerBatch: median(rows.map(row => row.timing.submitMs)) / batches
				, totalMsPerBatch: median(rows.map(row => row.timing.totalMs)) / batches
				, driver
			}];
		}));
	}
	await page.evaluate(() => window.indexMode('native'));
	await run(page, '$cleanup();');
	await page.evaluate(() => window.bindingPhp.refresh());
	assert.deepEqual(errors, []);
	for(const [name, path] of Object.entries(paths))
	{ assert.deepEqual(await fingerprint(path), hashes[name], `Input changed: ${name}`); }
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
