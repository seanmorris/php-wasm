import {test, expect} from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const libType = process.env.LIB_TYPE ?? 'dynamic';
test.skip(process.env.PHP_VARIANT !== '_sdl', 'Requires the SDL runtime artifact');

/**
 * Starts the real PHP example, using its normal checked asset loader.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<object>} Runtime startup result and elapsed time.
 */
const startCube = async page => {
	await page.goto('harness/index.html');
	return page.evaluate(async ({version, libType}) => {
		document.body.innerHTML = '<div id="example"></div><canvas tabindex="0"></canvas>';
		const {PhpWeb} = await import('/packages/php-wasm/PhpWeb.mjs');
		const {loadEmbeddedSharedLibs} = await import('/php-wasm/harness/runtime-libs.mjs');
		const {prepareSdlAssets} = await import('/php-wasm/demo-lib/sdlAssets.js');
		window.sdlErrors = '';
		window.sdlOutput = '';
		const started = performance.now();
		const php = window.sdlPhp = new PhpWeb({
			version, variant: '_sdl', canvas: document.querySelector('canvas')
			, sharedLibs: loadEmbeddedSharedLibs(libType, '_sdl')
			, ini: 'display_errors=0\nlog_errors=1\nerror_log=/dev/stderr'
		});
		php.addEventListener('error', event => window.sdlErrors += event.detail.join(''));
		php.addEventListener('output', event => window.sdlOutput += event.detail.join(''));
		await php.binary;
		const bootMs = performance.now() - started;
		await prepareSdlAssets(php, '/php-wasm/sdl-assets/');
		window.sdlCode = await (await fetch('/php-wasm/demo-scripts/sdl-cube.php')).text();
		const status = await php.run(window.sdlCode);
		return {status, bootMs, stderr: window.sdlErrors};
	}, {version, libType});
};

test('SDL cube renders texture and text, moves, handles focused input and cleans up on refresh', async ({page}, testInfo) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.addInitScript(() => {
		window.textureFilters = [];
		const parameter = WebGL2RenderingContext.prototype.texParameteri;
		WebGL2RenderingContext.prototype.texParameteri = function(target, name, value) {
			if(name === this.TEXTURE_MIN_FILTER || name === this.TEXTURE_MAG_FILTER)
			{
				window.textureFilters.push(value);
			}
			return parameter.call(this, target, name, value);
		};
	});
	const result = await startCube(page);
	expect(result.stderr).toBe('');
	expect(result.status).toBe(0);
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off');
	// SDL swaps must remain synchronous inside Vrzno animation callbacks.
	expect(await page.evaluate(async () => (await window.sdlPhp.binary)
		.ccall('SDL_GetHint', 'string', ['string'], ['SDL_EMSCRIPTEN_ASYNCIFY']))).toBe('0');
	expect(await page.evaluate(() => window.textureFilters.slice(0, 2))).toEqual([9728, 9728]); // GL_NEAREST
	const canvas = page.locator('canvas');
	await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(2);
	const pixels = await canvas.screenshot();
	await testInfo.attach('cube', {body: pixels, contentType: 'image/png'});
	const first = await canvas.getAttribute('data-rotation');
	await expect.poll(() => canvas.getAttribute('data-rotation')).not.toBe(first);
	await canvas.press('Space');
	await expect(canvas).toHaveAttribute('data-paused', '1');
	const paused = await canvas.getAttribute('data-rotation');
	await page.waitForTimeout(100);
	expect(await canvas.getAttribute('data-rotation')).toBe(paused);
	await page.keyboard.down('ArrowRight');
	await expect.poll(() => canvas.getAttribute('data-rotation')).not.toBe(paused);
	await page.keyboard.up('ArrowRight');
	await canvas.press('r');
	await expect(canvas).toHaveAttribute('data-rotation', '0.3500,0.5500');
	await page.evaluate(() => {
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();
	});
	await page.keyboard.press('Space');
	await expect(canvas).toHaveAttribute('data-paused', '1');
	await page.evaluate(() => window.sdlPhp.refresh());
	await expect(canvas).toHaveAttribute('data-stopped', '1');
	const frames = await canvas.getAttribute('data-frames');
	await page.waitForTimeout(100);
	expect(await canvas.getAttribute('data-frames')).toBe(frames);
	await page.evaluate(() => window.sdlPhp.run(window.sdlCode));
	await expect(canvas).toHaveAttribute('data-stopped', '0');
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off');
	// A direct rerun also calls SDL_Quit, without restarting the PHP request.
	await page.evaluate(() => window.sdlPhp.run(window.sdlCode));
	expect(await page.evaluate(async () => (await window.sdlPhp.binary)
		.ccall('SDL_GetHint', 'string', ['string'], ['SDL_EMSCRIPTEN_ASYNCIFY']))).toBe('0');
	await canvas.press('Escape');
	await expect(canvas).toHaveAttribute('data-stopped', '1');
	expect(await page.evaluate(() => window.sdlErrors)).toBe('');
	expect(errors).toEqual([]);
	await testInfo.attach('timings', {body: JSON.stringify({...result, fps: await canvas.getAttribute('data-fps')}), contentType: 'application/json'});
});

test('cube resizes its drawing buffer and projection for landscape and portrait boxes', async ({page}) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await startCube(page);
	await page.evaluate(() => {
		const canvas = document.querySelector('canvas');
		const box = document.createElement('div');
		box.id = 'cube-box';
		document.body.append(box);
		box.append(canvas);
		canvas.style.cssText = 'width: 100%; height: 100%; display: block';
	});
	for(const [width, height] of [[900, 240], [300, 500], [640, 400]])
	{
		await page.evaluate(([width, height]) => {
			const box = document.querySelector('#cube-box');
			box.style.width = `${width}px`;
			box.style.height = `${height}px`;
		}, [width, height]);
		await expect.poll(() => page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			const gl = canvas.getContext('webgl2');
			return [canvas.width, canvas.height, ...gl.getParameter(gl.VIEWPORT)];
		})).toEqual([width, height, 0, 0, width, height]);
		const aspect = await page.evaluate(() => {
			const gl = document.querySelector('canvas').getContext('webgl2');
			const program = gl.getParameter(gl.CURRENT_PROGRAM);
			const matrix = gl.getUniform(program, gl.getUniformLocation(program, 'matrix'));
			return Math.hypot(matrix[1], matrix[5], matrix[9]) / Math.hypot(matrix[0], matrix[4], matrix[8]);
		});
		expect(aspect).toBeCloseTo(width / height, 4);
	}
	await page.evaluate(() => window.sdlPhp.refresh());
	await expect(page.locator('canvas')).toHaveAttribute('data-stopped', '1');
	await page.evaluate(() => document.querySelector('#cube-box').style.width = '800px');
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(await page.evaluate(() => window.sdlErrors)).toBe('');
	expect(errors).toEqual([]);
});

test('credited MP3 music produces PCM only after a user gesture and stops when muted', async ({page}) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.addInitScript(() => {
		window.audioSamples = 0;
		const create = AudioContext.prototype.createScriptProcessor;
		AudioContext.prototype.createScriptProcessor = function(...args) {
			const node = create.apply(this, args);
			const descriptor = Object.getOwnPropertyDescriptor(ScriptProcessorNode.prototype, 'onaudioprocess');
			Object.defineProperty(node, 'onaudioprocess', {
				set(callback) {
					descriptor.set.call(node, event => {
						callback(event);
						if(event.outputBuffer.getChannelData(0).some(sample => Math.abs(sample) > .001)) window.audioSamples++;
					});
				}
			});
			return node;
		};
	});
	await startCube(page);
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off');
	await expect(page.locator('[data-sdl-credit]')).toHaveText('Music: Unreal Superhero 3 — Kenët and rez');
	expect(await page.evaluate(() => window.audioSamples)).toBe(0);
	await page.locator('[data-sdl-audio]').click();
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(0);
	// Stop the WAV effect so continued PCM proves the music itself is playing.
	await page.evaluate(async () => {
		window.sdlOutput = '';
		await window.sdlPhp.run('<?php Mix_HaltChannel(-1); echo Mix_PlayingMusic();');
	});
	expect(await page.evaluate(() => window.sdlOutput)).toBe('1');
	const musicSamples = await page.evaluate(() => window.audioSamples);
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(musicSamples + 2);
	await page.locator('[data-sdl-audio]').click();
	await expect(page.locator('[data-sdl-audio]')).toHaveText('Enable audio');
	await page.waitForTimeout(200);
	const count = await page.evaluate(() => window.audioSamples);
	await page.waitForTimeout(200);
	expect(await page.evaluate(() => window.audioSamples)).toBe(count);
	await page.evaluate(() => window.sdlPhp.refresh());
	await expect(page.locator('canvas')).toHaveAttribute('data-stopped', '1');
	const loadedMp3 = await page.evaluate(async () => {
		window.sdlOutput = '';
		await window.sdlPhp.run('<?php echo Mix_Init(0) & MIX_INIT_MP3;');
		return window.sdlOutput;
	});
	expect(loadedMp3).toBe('0');
	await page.evaluate(() => window.sdlPhp.run(window.sdlCode));
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off');
	const restartSamples = await page.evaluate(() => window.audioSamples);
	await page.locator('[data-sdl-audio]').click();
	await page.evaluate(() => window.sdlPhp.run('<?php Mix_HaltChannel(-1);'));
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(restartSamples + 2);
	await page.locator('canvas').press('Escape');
	expect(await page.evaluate(async () => {
		window.sdlOutput = '';
		await window.sdlPhp.run('<?php echo Mix_Init(0) & MIX_INIT_MP3;');
		return window.sdlOutput;
	})).toBe('0');
	expect(errors).toEqual([]);
	expect(await page.evaluate(() => window.sdlErrors)).toBe('');
});

test('corrupt MP3 can be retried while the cube keeps rendering', async ({page}) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await startCube(page);
	await page.evaluate(async () => {
		const {FS} = await window.sdlPhp.binary;
		window.goodMusic = FS.readFile('/preload/sdl/WOJTEK3.mp3');
		FS.writeFile('/preload/sdl/WOJTEK3.mp3', new TextEncoder().encode('invalid MP3'));
	});
	const canvas = page.locator('canvas');
	await page.locator('[data-sdl-audio]').click();
	await expect(page.locator('[data-sdl-status]')).toContainText('Audio unavailable: Decode music:');
	await expect(page.locator('[data-sdl-audio]')).toHaveText('Retry audio');
	const loadedMp3 = await page.evaluate(async () => {
		window.sdlOutput = '';
		await window.sdlPhp.run('<?php echo Mix_Init(0) & MIX_INIT_MP3;');
		return window.sdlOutput;
	});
	expect(loadedMp3).toBe('0');
	const frames = Number(await canvas.getAttribute('data-frames'));
	await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(frames);
	await page.evaluate(async () => {
		(await window.sdlPhp.binary).FS.writeFile('/preload/sdl/WOJTEK3.mp3', window.goodMusic);
		delete window.goodMusic;
	});
	await page.locator('[data-sdl-audio]').click();
	await expect(page.locator('[data-sdl-audio]')).toHaveText('Mute audio');
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound on');
	await page.evaluate(() => window.sdlPhp.refresh());
	await expect(canvas).toHaveAttribute('data-stopped', '1');
	expect(errors).toEqual([]);
	expect(await page.evaluate(() => window.sdlErrors)).toBe('');
});

test('graphics context loss pauses rendering and restoration rebuilds resources', async ({page}) => {
	await startCube(page);
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off');
	await page.evaluate(() => {
		window.contextLoss = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
		window.contextLoss.loseContext();
	});
	await expect(page.locator('[data-sdl-status]')).toContainText('Graphics context lost');
	const frames = await page.locator('canvas').getAttribute('data-frames');
	await page.waitForTimeout(100);
	expect(await page.locator('canvas').getAttribute('data-frames')).toBe(frames);
	await page.evaluate(() => window.contextLoss.restoreContext());
	await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-frames'))).toBeGreaterThan(Number(frames));
	expect(await page.evaluate(() => window.sdlErrors)).toBe('');
	await page.evaluate(() => window.sdlPhp.refresh());
});

test('native bindings check uploads, preserve colors and invalidate freed audio/font objects', async ({page}) => {
	await startCube(page);
	await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off');
	await page.locator('[data-sdl-audio]').click();
	const result = await page.evaluate(async () => {
		const php = window.sdlPhp;
		const {FS} = await php.binary;
		for(const name of ['cube.png', 'cube.jpg', 'cube.bmp'])
		{
			FS.writeFile(`/preload/sdl/${name}`, new Uint8Array(await (await fetch(`/php-wasm/fixtures/sdl/${name}`)).arrayBuffer()));
		}
		window.sdlOutput = '';
		await php.run(`<?php
		$images = [];
		$event = new SDL_Event;
		while(SDL_PollEvent($event)) {}
		$event->type = SDL_QUIT;
		$emptyPoll = SDL_PollEvent($event) === 0 && $event->type === SDL_QUIT;
		foreach(['png', 'jpg', 'bmp'] as $format) {
			$surface = IMG_Load('/preload/sdl/cube.' . $format);
			$images[$format] = [$surface->w, $surface->h];
			SDL_FreeSurface($surface);
		}
		$missing = [IMG_Load('/missing.png'), TTF_OpenFont('/missing.ttf', 12), Mix_LoadWAV('/missing.wav'), Mix_LoadMUS('/missing.ogg')];
		file_put_contents('/bad.png', 'invalid image');
		$missing[] = IMG_Load('/bad.png');
		file_put_contents('/bad.mp3', 'invalid MP3');
		$missing[] = Mix_LoadMUS('/bad.mp3');
		$decoders = [Mix_HasMusicDecoder('OGG'), Mix_HasMusicDecoder('MP3'), Mix_HasMusicDecoder('FLAC'), Mix_GetChunkDecoder(-1), Mix_GetMusicDecoder(-1)];
		$errors = [];
		$reject = function($name, $callback) use (&$errors) {
			try { $callback(); } catch(ValueError | TypeError | Error $error) { $errors[] = $name; }
		};
		$reject('buffer-size', function() { glBufferData(GL_ARRAY_BUFFER, 128, 'a', GL_STATIC_DRAW); });
		$reject('invalid-renderer', function() { IMG_LoadTexture(new stdClass, '/missing.png'); });
		$reject('shader-count', function() { glShaderSource(1, 2, 'a'); });
		$reject('matrix-size', function() { glUniformMatrix4fv(0, 1, false, [1]); });
		$reject('matrix-nan', function() { glUniformMatrix4fv(0, 1, false, array_fill(0, 16, NAN)); });
		$reject('index-bounds', function() { glDrawElements(GL_TRIANGLES, 100000, GL_UNSIGNED_SHORT, 0); });
		$reject('delete-count', function() { glDeleteBuffers(2, [1]); });
		$reject('pixel-size', function() { glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 10, 10, 0, GL_RGBA, GL_UNSIGNED_BYTE, 'a'); });
		$reject('pixel-overflow', function() { glReadPixels(0, 0, 2147483647, 2147483647, GL_RGBA, GL_FLOAT); });
		$reject('pixel-object', function() { glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, new stdClass); });
		$surface = IMG_Load('/preload/sdl/cube.png');
		$texture = $framebuffer = [];
		glGenTextures(1, $texture);
		glBindTexture(GL_TEXTURE_2D, $texture[0]);
		glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 128, 128, 0, GL_RGBA, GL_UNSIGNED_BYTE, $surface);
		SDL_FreeSurface($surface);
		$reject('freed-surface', function() use ($surface) { glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 128, 128, 0, GL_RGBA, GL_UNSIGNED_BYTE, $surface); });
		glGenFramebuffers(1, $framebuffer);
		glBindFramebuffer(GL_FRAMEBUFFER, $framebuffer[0]);
		glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, $texture[0], 0);
		$complete = glCheckFramebufferStatus(GL_FRAMEBUFFER) === GL_FRAMEBUFFER_COMPLETE;
		$color = bin2hex(glReadPixels(0, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE));
		$surfaceColors = [];
		foreach([24, 32] as $depth) {
			// Three RGB pixels have padding at the end of each 24-bit row.
			$surface = SDL_CreateRGBSurface(0, 3, 2, $depth, 0xff, 0xff00, 0xff0000, $depth === 32 ? -16777216 : 0);
			SDL_FillRect($surface, new SDL_Rect(0, 0, 3, 2), SDL_MapRGBA($surface->format, 17, 34, 51, 68));
			glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 3, 2, 0, GL_RGBA, GL_UNSIGNED_BYTE, $surface);
			SDL_FreeSurface($surface);
			$surfaceColors[] = bin2hex(glReadPixels(2, 1, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE));
		}
		glBindFramebuffer(GL_FRAMEBUFFER, 0);
		glDeleteFramebuffers(1, $framebuffer);
		glDeleteTextures(1, $texture);
		$shader = glCreateShader(GL_VERTEX_SHADER);
		glShaderSource($shader, 1, 'invalid shader');
		glCompileShader($shader);
		$log = glGetShaderInfoLog($shader);
		$diagnostic = !glGetShaderiv($shader, GL_COMPILE_STATUS) && strlen($log) > 0 && strpos($log, chr(0)) === false;
		glDeleteShader($shader);
		$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf', 12);
		TTF_CloseFont($font); TTF_CloseFont($font);
		$reject('closed-font', function() use ($font) { TTF_RenderText_Blended($font, 'x', new SDL_Color(255,255,255)); });
		$chunk = Mix_LoadWAV('/preload/sdl/click.wav');
		$channel = Mix_PlayChannel(-1, $chunk, -1);
		$alias = Mix_GetChunk($channel);
		$same = $alias === $chunk;
		Mix_FreeChunk($chunk); Mix_FreeChunk($alias);
		$reject('freed-chunk', function() use ($alias) { Mix_PlayChannel(-1, $alias, 0); });
		$rw = SDL_RWFromFile('/preload/sdl/loop.ogg', 'rb');
		$music = Mix_LoadMUS_RW($rw, 0);
		SDL_RWclose($rw);
		$streamed = Mix_PlayMusic($music, -1) === 0;
		Mix_HaltMusic(); Mix_FreeMusic($music); Mix_FreeMusic($music);
		$reject('freed-music', function() use ($music) { Mix_PlayMusic($music, 0); });
		$owned = SDL_RWFromFile('/preload/sdl/click.wav', 'rb');
		$chunk = Mix_LoadWAV_RW($owned, 1);
		Mix_FreeChunk($chunk);
		$reject('closed-rw', function() use ($owned) { Mix_LoadWAV_RW($owned, 0); });
		echo json_encode(compact('images', 'missing', 'errors', 'complete', 'color', 'surfaceColors', 'diagnostic', 'same', 'streamed', 'emptyPoll', 'decoders'));
		`);
		return {output: window.sdlOutput, stderr: window.sdlErrors};
	});
	expect(result.stderr).toBe('');
	const data = JSON.parse(result.output);
	expect(data.images).toEqual({png: [128, 128], jpg: [128, 128], bmp: [128, 128]});
	expect(data.missing).toEqual([null, null, null, null, null, null]);
	expect(data.decoders).toEqual([true, true, false, null, null]);
	expect(data.color).toBe('f9cf47ff');
	expect(data.surfaceColors).toEqual(['112233ff', '11223344']);
	expect(data.complete && data.diagnostic && data.same && data.streamed && data.emptyPoll).toBe(true);
	expect(data.errors).toEqual(['buffer-size', 'invalid-renderer', 'shader-count', 'matrix-size', 'matrix-nan', 'index-bounds', 'delete-count', 'pixel-size', 'pixel-overflow', 'pixel-object', 'freed-surface', 'closed-font', 'freed-chunk', 'freed-music', 'closed-rw']);
	await page.evaluate(() => window.sdlPhp.refresh());
});
