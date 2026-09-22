import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {chromium} from '@playwright/test';
import {getPlaywrightLaunchOptions} from '../../lib/playwright-browser.mjs';

const [baselineDirectory, candidateDirectory, output] = process.argv.slice(2);
assert.ok(output, 'Usage: node test/perf/sdl/font-lifetimes.mjs baseline-dir candidate-dir output.json');
process.env.PHP_VERSION ??= '8.4';
process.env.PHP_VARIANT = '_sdl';
process.env.LIB_TYPE ??= 'static';
const {start, run, allocationStats} = await import('../../browser/lib/sdl-bindings.mjs');
const {headless, launchOptions} = getPlaywrightLaunchOptions();
const browser = await chromium.launch({headless, ...launchOptions});
const version = process.env.PHP_VERSION;
const results = {};

try
{
	for(const [name, directory] of [['baseline', baselineDirectory], ['candidate', candidateDirectory]])
	{
		process.env.SDL_TEST_ARTIFACT_DIR = resolve(directory);
		const page = await browser.newPage({baseURL: `http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/`});
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		await start(page);
		const samples = [{step: 'initial', ...await allocationStats(page)}];
		await run(page, `
		function dropSdlFonts($count) {
			for($i = 0; $i < $count; $i++) {
				$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12);
				if(!$font) { throw new RuntimeException(SDL_GetError()); }
				unset($font);
			}
			gc_collect_cycles();
		}
		TTF_Init();
		$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12);
		TTF_CloseFont($font); unset($font);
		`);
		samples.push({step: 'warm', ...await allocationStats(page)});
		for(let batch = 1; batch <= 3; batch++)
		{
			await run(page, 'dropSdlFonts(50);');
			samples.push({step: `after-${batch * 50}-fonts`, ...await allocationStats(page)});
		}
		await run(page, 'TTF_Quit();');
		samples.push({step: 'quit', ...await allocationStats(page)});
		assert.deepEqual(errors, []);
		const hashes = {};
		for(const filename of [`php${version}_sdl-web.mjs`, `php${version}_sdl-web.mjs.wasm`])
		{
			const bytes = await readFile(join(directory, filename));
			hashes[filename] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
		}
		results[name] = {directory, hashes, samples};
		await page.close();
	}
	const summary = Object.fromEntries(Object.entries(results).map(([name, {samples}]) => [name, {
		retainedSdlAllocations: samples[4].sdlAllocations - samples[1].sdlAllocations
		, liveByteIncrease: samples[4].liveBytes - samples[1].liveBytes
		, sdlAllocationsAfterQuit: samples[5].sdlAllocations
	}]));
	const font = await readFile(new URL('../../../demo-web/public/sdl/DejaVuSansMono.ttf', import.meta.url));
	await writeFile(output, JSON.stringify({
		date: new Date().toISOString(), phpVersion: version, profile: process.env.LIB_TYPE
		, browser: browser.version(), launch: {headless, args: launchOptions.args}
		, font: {name: 'DejaVuSansMono.ttf', bytes: font.length, sha256: createHash('sha256').update(font).digest('hex')}
		, fontsPerBatch: 50, batches: 3, ...results, summary
		, notes: [
			'Run with native builds, compression and other benchmarks idle; this records counts, not throughput.'
			, 'Each runtime uses a fresh browser page and matching routed JavaScript/Wasm artifacts.'
			, 'Font initialization and one explicit open/close occur before the warm sample.'
			, 'liveBytes is dlmalloc uordblks, including a temporary 40-byte mallinfo output allocation in every snapshot.'
			, 'reservedBytes and wasmBytes include reusable allocator/linear-memory capacity; they are not live allocations.'
			, 'SDL counts and heap bytes cover this font fixture; they do not prove other resources are leak-free.'
		]
	}, null, 2) + '\n');
	console.log(JSON.stringify(summary, null, 2));
}
finally
{
	await browser.close();
}
