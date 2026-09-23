import {expect} from '@playwright/test';
import {resolve} from 'node:path';

const version = process.env.PHP_VERSION ?? '8.4';

/**
 * Route native artifacts to the explicitly selected build, when supplied.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<void>} Resolves after both artifact routes are registered.
 */
export const routeRuntime = async page => {
	if(process.env.SDL_TEST_ARTIFACT_DIR)
	{
		await page.route('**/packages/php-sdl-wasm/*', route => {
			const name = new URL(route.request().url()).pathname.split('/').pop();
			return route.fulfill({
				path: resolve(process.env.SDL_TEST_ARTIFACT_DIR, name)
				, contentType: name.endsWith('.mjs') ? 'text/javascript' : 'application/wasm'
			});
		});
	}
};

/**
 * Start a fresh runtime and canvas for native binding tests.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<void>} Resolves when assets are ready.
 */
export const start = async page => {
	await routeRuntime(page);
	await page.goto('harness/index.html');
	await page.evaluate(async version => {
		document.body.innerHTML = '<canvas tabindex="0" width="64" height="64"></canvas>';
		const {PhpSdl} = await import(`/packages/php-sdl-wasm/php${version}-sdl.mjs`);
		const {prepareSdlAssets} = await import('/php-wasm/demo-lib/sdlAssets.js');
		window.bindingPhp = new PhpSdl({
			canvas: document.querySelector('canvas')
			, ini: 'display_errors=0\nlog_errors=1\nerror_log=/dev/stderr'
		});
		window.bindingOutput = window.bindingErrors = '';
		window.bindingPhp.addEventListener('output', event => window.bindingOutput += event.detail.join(''));
		window.bindingPhp.addEventListener('error', event => window.bindingErrors += event.detail.join(''));
		await window.bindingPhp.binary;
		await prepareSdlAssets(window.bindingPhp, '/php-wasm/sdl-assets/');
	}, version);
};

/**
 * Run PHP in the same request and require clean native/PHP diagnostics.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {string} source PHP source without its opening tag.
 * @returns {Promise<unknown>} Decoded JSON output, or null.
 */
export const run = async (page, source) => {
	const result = await page.evaluate(async source => {
		window.bindingOutput = window.bindingErrors = '';
		const status = await window.bindingPhp.run(`<?php ${source}`);
		return {status, output: window.bindingOutput, errors: window.bindingErrors};
	}, source);
	expect(result.errors).toBe('');
	expect(result.status).toBe(0);
	return result.output ? JSON.parse(result.output) : null;
};

/**
 * Read live SDL allocations and dlmalloc accounting from the pinned wasm32 build.
 * The SDK's dlmalloc.c defines ten 32-bit mallinfo fields; uordblks is field 7.
 * @param {import('@playwright/test').Page} page Browser with an idle PHP runtime.
 * @returns {Promise<object>} Native counts and allocated/reserved memory in bytes.
 */
export const allocationStats = async page => page.evaluate(async () => {
	const module = await window.bindingPhp.binary;
	const pointer = module._malloc(40);
	if(!pointer)
	{
		throw new Error('Cannot allocate mallinfo output');
	}
	try
	{
		module._mallinfo(pointer);
		return {
			sdlAllocations: module._SDL_GetNumAllocations()
			, liveBytes: new DataView(module.HEAPU8.buffer).getUint32(pointer + 7 * 4, true)
			, reservedBytes: module._malloc_footprint()
			, wasmBytes: module.HEAPU8.byteLength
		};
	}
	finally
	{
		module._free(pointer);
	}
});

export const rejectHelper = `
$rejected = [];
$reject = function($label, $callback) use (&$rejected) {
	try { $callback(); } catch(Throwable $error) { $rejected[] = $label; }
};
`;

export const windowSetup = `
if(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) !== 0) { throw new RuntimeException(SDL_GetError()); }
$window = SDL_CreateWindow('Bindings', 0, 0, 64, 64, SDL_WINDOW_SHOWN);
if(!$window) { throw new RuntimeException(SDL_GetError()); }
`;
