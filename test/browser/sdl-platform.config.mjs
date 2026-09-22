import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';

if(process.env.PHP_VARIANT !== '_sdl')
{
	throw new Error('Build WITH_SDL=1 and set PHP_VARIANT=_sdl for the SDL platform checks.');
}

// These native fixtures use portable browser paths. Audio checks need a working
// output device (a software sink is sufficient). Chromium's CDP composition and
// deferred-activation cases remain in the ordinary browser suite.
export default defineConfig({
	testDir: fileURLToPath(new URL('.', import.meta.url))
	, testMatch: [
		'sdl-pointer.spec.mjs', 'sdl-text.spec.mjs', 'sdl-audio.spec.mjs'
		, 'sdl-bindings.spec.mjs', 'sdl-engine.spec.mjs', 'sdl-textures.spec.mjs'
	]
	, grep: /actual pointer lock|active pointer lock cleanup|window cleanup preserves|combined fullscreen|before an application event handler|textarea fallback.*commits complete|closing an unused mixer|request refresh after audio shutdown|decoder initialization after audio shutdown|font face metadata|standard controllers|culling and depth writes|generated mipmaps/
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
