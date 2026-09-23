import assert from 'node:assert/strict';
import {artifactFiles} from './artifacts.mjs';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {chromium} from '@playwright/test';
import {getPlaywrightLaunchOptions} from '../../lib/playwright-browser.mjs';

const [baselineDirectory, candidateDirectory, output] = process.argv.slice(2);
assert.ok(output, 'Usage: node test/perf/sdl/audio-lifetimes.mjs baseline-dir candidate-dir output.json');
process.env.PHP_VERSION ??= '8.4';
process.env.PHP_VARIANT = '_sdl';
process.env.LIB_TYPE ??= 'static';
const {run, allocationStats} = await import('../../browser/lib/sdl-bindings.mjs');
const {startAudio, primeAudio} = await import('../../browser/lib/sdl-audio.mjs');
const version = process.env.PHP_VERSION;
const pairs = [['baseline', baselineDirectory], ['candidate', candidateDirectory]];
for(const [, directory] of pairs)
{
	await artifactFiles(directory, version);
}
const {headless, launchOptions} = getPlaywrightLaunchOptions();
const browser = await chromium.launch({headless, ...launchOptions});
const results = {};

try
{
	for(const [name, directory] of pairs)
	{
		process.env.SDL_TEST_ARTIFACT_DIR = resolve(directory);
		const page = await browser.newPage({baseURL: `http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/`});
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		await startAudio(page);
		const samples = [{step: 'initial', ...await allocationStats(page)}];
		await run(page, `
		function dropSdlAudio($count) {
			for($i = 0; $i < $count; $i++) {
				$chunk = Mix_LoadWAV('/preload/sdl/click.wav');
				$music = Mix_LoadMUS('/preload/sdl/click.wav');
				if(!$chunk || !$music) { throw new RuntimeException(SDL_GetError()); }
				unset($chunk,$music);
			}
			gc_collect_cycles();
		}
		SDL_Init(SDL_INIT_AUDIO);
		if(Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024) !== 0) { throw new RuntimeException(SDL_GetError()); }
		$chunk = Mix_LoadWAV('/preload/sdl/click.wav');
		$music = Mix_LoadMUS('/preload/sdl/click.wav');
		Mix_FreeChunk($chunk); Mix_FreeMusic($music); unset($chunk,$music);
		`);
		await primeAudio(page);
		samples.push({step: 'warm', ...await allocationStats(page)});
		for(let batch = 1; batch <= 3; batch++)
		{
			await run(page, 'dropSdlAudio(50);');
			samples.push({step: `after-${batch * 50}-audio-pairs`, ...await allocationStats(page)});
		}
		await run(page, 'Mix_CloseAudio(); Mix_Quit(); SDL_Quit();');
		samples.push({step: 'quit', ...await allocationStats(page)});
		assert.deepEqual(errors, []);
		const hashes = {};
		for(const filename of await artifactFiles(directory, version))
		{
			const bytes = await readFile(join(directory, filename));
			hashes[filename] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
		}
		results[name] = {directory, hashes, samples};
		await page.close();
	}
	const summary = {};
	for(const [name, {samples}] of Object.entries(results))
	{
		summary[name] = {
			retainedSdlAllocations: samples[4].sdlAllocations - samples[1].sdlAllocations
			, liveByteIncrease: samples[4].liveBytes - samples[1].liveBytes
			, sdlAllocationsAfterQuit: samples[5].sdlAllocations
		};
	}
	const asset = await readFile(new URL('../../../demo-web/public/sdl/click.wav', import.meta.url));
	await writeFile(output, JSON.stringify({
		date: new Date().toISOString()
		, phpVersion: version
		, profile: process.env.LIB_TYPE
		, browser: browser.version(), launch: {headless, args: launchOptions.args}
		, asset: {name: 'click.wav', bytes: asset.length, sha256: createHash('sha256').update(asset).digest('hex')}
		, chunkMusicPairsPerBatch: 50, batches: 3, ...results, summary
		, notes: [
			'Run with native builds, compression and other benchmarks idle; this records counts, not throughput.'
			, 'Each runtime uses a fresh browser page and matching routed JavaScript/Wasm artifacts.'
			, 'Audio initialization, a real Web Audio callback and one explicitly freed chunk/music pair precede the warm sample.'
			, 'liveBytes is dlmalloc uordblks, including a temporary 40-byte mallinfo output allocation in every snapshot.'
			, 'reservedBytes and wasmBytes include reusable allocator/linear-memory capacity; they are not live allocations.'
			, 'SDL counts and heap bytes cover this chunk/music fixture; they do not prove other resources are leak-free.'
		]
	}, null, 2) + '\n');
	console.log(JSON.stringify(summary, null, 2));
}
finally
{
	await browser.close();
}
