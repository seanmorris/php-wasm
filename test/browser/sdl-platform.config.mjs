import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';

if(process.env.PHP_VARIANT !== '_sdl')
{
	throw new Error('Build WITH_SDL=1 and set PHP_VARIANT=_sdl for the SDL platform checks.');
}

// These existing native fixtures use portable input paths. Chromium's CDP
// composition/deferred-activation cases remain in the ordinary browser suite.
export default defineConfig({
	testDir: fileURLToPath(new URL('.', import.meta.url))
	, testMatch: ['sdl-pointer.spec.mjs', 'sdl-text.spec.mjs']
	, grep: /actual pointer lock|active pointer lock cleanup|window cleanup preserves|combined fullscreen|before an application event handler|textarea fallback.*commits complete/
	, workers: 1
	, timeout: 180000
	, retries: 0
	, use: {
		baseURL: `http://127.0.0.1:${process.env.BROWSER_TEST_PORT ?? 9000}/php-wasm/`
		, trace: 'retain-on-failure'
		, screenshot: 'only-on-failure'
		, headless: false
	}
	, projects: [
		{name: 'firefox', use: {browserName: 'firefox'}}
		, {name: 'webkit', use: {browserName: 'webkit'}}
	]
});
