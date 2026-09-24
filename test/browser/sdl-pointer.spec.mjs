import {test, expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {start, run, windowSetup, allocationStats} from './lib/sdl-bindings.mjs';

const execute = promisify(execFile);

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

/**
 * Observe actual browser lock/error events on the supplied SDL canvas.
 * @param {import('@playwright/test').Page} page Browser runtime.
 * @returns {Promise<string[]>} JavaScript errors reported during this test.
 */
const initialize = async page => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await start(page);
	await page.bringToFront();
	await page.evaluate(() => {
		window.pointerCanvas = document.querySelector('canvas');
		window.pointerEvents = [];
		for(const type of ['pointerlockchange', 'pointerlockerror'])
		{
			document.addEventListener(type, event => window.pointerEvents.push({
				type, trusted: event.isTrusted
				, locked: window.pointerCanvas.getRootNode().pointerLockElement === window.pointerCanvas
			}));
		}
	});
	return errors;
};

/**
 * Query actual lock, including a canvas hosted inside a shadow root.
 * @param {import('@playwright/test').Page} page Browser runtime.
 * @returns {Promise<boolean>} Whether the browser has locked SDL's canvas.
 */
const locked = page => page.evaluate(() =>
	window.pointerCanvas.getRootNode().pointerLockElement === window.pointerCanvas);

/**
 * Submit relative mode from a real click in browsers with different activation rules.
 * @param {import('@playwright/test').Page} page Browser runtime.
 * @returns {Promise<number>} Native SDL submission result.
 */
const enable = async page => {
	await run(page, String.raw`
	$browser=new Vrzno; $browser->pointerActivationResult=null;
	$browser->pointerActivate=function() use($browser) {
		SDL_ClearError(); $browser->pointerActivationResult=SDL_SetRelativeMouseMode(true);
	};
	`);
	await page.evaluate(() => window.pointerCanvas.addEventListener('click', window.pointerActivate, {once: true}));
	try
	{
		await page.locator('canvas').first().click();
		return await page.evaluate(() => window.pointerActivationResult);
	}
	finally
	{
		await page.evaluate(() => {
			window.pointerCanvas.removeEventListener('click', window.pointerActivate);
			delete window.pointerActivate;
		});
	}
};

/**
 * Evaluate without Playwright renewing the browser's transient activation.
 * @param {import('@playwright/test').CDPSession} client Browser protocol.
 * @param {string} expression JavaScript expression, optionally asynchronous.
 * @returns {Promise<unknown>} Copied browser result.
 */
const withoutGesture = async (client, expression) => {
	const response = await client.send('Runtime.evaluate', {
		expression, awaitPromise: true, returnByValue: true, userGesture: false
	});
	expect(response.exceptionDetails).toBeUndefined();
	return response.result.value;
};

for(const placement of ['no ID', 'custom ID with decoy', 'shadow root'])
{
	test(`actual pointer lock and motion use the supplied canvas with ${placement}`, async ({page, browserName}) => {
		const errors = await initialize(page);
		await page.evaluate(placement => {
			const canvas = window.pointerCanvas;
			if(placement === 'custom ID with decoy')
			{
				canvas.id = 'SDL canvas:1';
				const decoy = document.createElement('canvas');
				decoy.id = 'canvas';
				document.body.append(decoy);
			}
			if(placement === 'shadow root')
			{
				const host = document.createElement('div');
				document.body.append(host);
				host.attachShadow({mode: 'open'}).append(canvas);
			}
		}, placement);
		await run(page, windowSetup);
		await page.locator('canvas').first().hover();
		expect(await enable(page)).toBe(0);
		await expect.poll(() => locked(page)).toBe(true);
		expect(await run(page, 'echo json_encode(SDL_GetRelativeMouseMode());')).toBe(true);
		await run(page, 'SDL_GetRelativeMouseState($x,$y);');
		await page.evaluate(() => {
			window.pointerMoves = [];
			window.pointerCanvas.addEventListener('mousemove', event =>
				window.pointerMoves.push([event.movementX,event.movementY]));
		});
		if(browserName === 'webkit')
		{
			// WebKit's protocol mouse injection supplies zero movementX/Y while
			// locked. Use native X11 input in this suite's isolated virtual display.
			await execute('xdotool', ['mousemove_relative', '--', '7', '5'], {timeout: 5000});
			await expect.poll(() => page.evaluate(() => window.pointerMoves.some(([x,y]) => x || y))).toBe(true);
		}
		else
		{
			await page.mouse.move(41, 37);
			await page.mouse.move(48, 42);
		}
		const moves = await page.evaluate(() => window.pointerMoves);
		expect(moves.length).toBeGreaterThan(0);
		const delta = moves.reduce(([x,y], [dx,dy]) => [x + dx,y + dy], [0,0]);
		expect(delta.some(value => value !== 0)).toBe(true);
		expect(await run(page, 'SDL_GetRelativeMouseState($x,$y); echo json_encode([$x,$y]);')).toEqual(delta);
		expect(await run(page, 'echo json_encode(SDL_SetRelativeMouseMode(false));')).toBe(0);
		await expect.poll(() => locked(page)).toBe(false);
		expect(await page.evaluate(() => window.pointerEvents)).toContainEqual({
			type: 'pointerlockchange', trusted: true, locked: true
		});
		expect(errors).toEqual([]);
	});
}

for(const mode of ['destroy', 'video quit', 'SDL quit', 'PHP refresh'])
{
	for(const pending of [false, true])
	{
		test(`${pending ? 'deferred' : 'active'} pointer lock cleanup survives ${mode}`, async ({page, context}) => {
			const errors = await initialize(page);
			await run(page, windowSetup);
			await page.locator('canvas').hover();
			if(pending)
			{
				const client = await context.newCDPSession(page);
				await expect.poll(() => withoutGesture(client, 'navigator.userActivation.isActive'), {timeout: 7500}).toBe(false);
				const result = await withoutGesture(client, `(async()=>{
					window.bindingOutput=window.bindingErrors='';
					const status=await window.bindingPhp.run('<?php echo json_encode(SDL_SetRelativeMouseMode(true));');
					return {status,output:window.bindingOutput,errors:window.bindingErrors};
				})()`);
				expect(result).toEqual({status: 0, output: '0', errors: ''});
				expect(await withoutGesture(client, '!!document.pointerLockElement')).toBe(false);
			}
			else
			{
				expect(await enable(page)).toBe(0);
				await expect.poll(() => locked(page)).toBe(true);
			}
			if(mode === 'PHP refresh')
			{
				await page.evaluate(() => window.bindingPhp.refresh());
				await run(page, windowSetup);
			}
			else
			{
				const teardown = {
					destroy: 'SDL_DestroyWindow($window);'
					, 'video quit': 'SDL_VideoQuit(); SDL_VideoInit();'
					, 'SDL quit': 'SDL_Quit(); SDL_Init(SDL_INIT_VIDEO);'
				}[mode];
				await run(page, `${teardown}
				$window=SDL_CreateWindow('Replacement',0,0,29,23,SDL_WINDOW_SHOWN);
				if(!$window) { throw new RuntimeException(SDL_GetError()); }
				`);
			}
			await expect.poll(() => locked(page)).toBe(false);
			expect(await run(page, 'echo json_encode(SDL_GetRelativeMouseMode());')).toBe(false);
			await page.locator('canvas').click();
			await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			expect(await locked(page)).toBe(false);
			expect(errors).toEqual([]);
		});
	}
}

test('sandbox pointer lock denial reports an SDL error without an unhandled rejection', async ({page}) => {
	await page.route('**/harness/index.html', async route => {
		const response = await route.fetch();
		await route.fulfill({
			response
			, headers: {
				...response.headers(), 'Content-Security-Policy': 'sandbox allow-scripts allow-same-origin'
			}
		});
	});
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	expect(await enable(page)).toBe(0);
	await expect.poll(() => page.evaluate(() => window.pointerEvents.filter(event =>
		event.type === 'pointerlockerror' && event.trusted).length)).toBeGreaterThan(0);
	await expect.poll(() => run(page, 'echo json_encode(SDL_GetError());')).toMatch(/pointer lock.*(denied|failed|SecurityError)/i);
	expect(await locked(page)).toBe(false);
	expect(await run(page, 'echo json_encode(SDL_GetRelativeMouseMode());')).toBe(true);
	await page.locator('canvas').click();
	await expect.poll(() => page.evaluate(() => window.pointerEvents.filter(event =>
		event.type === 'pointerlockerror' && event.trusted).length)).toBeGreaterThan(1);
	expect(errors).toEqual([]);
});

test('unsupported pointer lock fails before SDL falls back to unavailable mouse warping', async ({page}) => {
	await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	await page.evaluate(() => window.pointerCanvas.requestPointerLock = undefined);
	const result = await run(page, String.raw`
	SDL_ClearError(); $status=SDL_SetRelativeMouseMode(true);
	echo json_encode([$status,SDL_GetRelativeMouseMode(),SDL_GetError()]);
	`);
	expect(result.slice(0, 2)).toEqual([-1,false]);
	expect(result[2]).toMatch(/pointer lock.*(unavailable|unsupported)/i);
});

test('relative mode without a focused window fails with an SDL error', async ({page}) => {
	await initialize(page);
	const result = await run(page, String.raw`
	SDL_Init(SDL_INIT_VIDEO); SDL_ClearError(); $status=SDL_SetRelativeMouseMode(true);
	echo json_encode([$status,SDL_GetRelativeMouseMode(),SDL_GetError()]);
	`);
	expect(result.slice(0, 2)).toEqual([-1,false]);
	expect(result[2]).toMatch(/pointer lock.*window/i);
});

test('window cleanup preserves pointer lock owned by another element', async ({page}) => {
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	expect(await enable(page)).toBe(0);
	await expect.poll(() => locked(page)).toBe(true);
	await page.evaluate(async () => {
		const other = window.otherPointerTarget = document.createElement('div');
		document.body.append(other);
		await other.requestPointerLock();
	});
	await expect.poll(() => page.evaluate(() => document.pointerLockElement === window.otherPointerTarget)).toBe(true);
	await run(page, 'SDL_DestroyWindow($window); SDL_Quit();');
	expect(await page.evaluate(() => document.pointerLockElement === window.otherPointerTarget)).toBe(true);
	expect(await run(page, 'echo json_encode(SDL_GetRelativeMouseMode());')).toBe(false);
	expect(errors).toEqual([]);
	await page.evaluate(() => document.exitPointerLock());
});

test('combined fullscreen and pointer lock teardown preserves the replacement canvas', async ({page}) => {
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	expect(await run(page, 'echo json_encode(SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP));')).toBe(0);
	await expect.poll(() => page.evaluate(() => document.fullscreenElement === window.pointerCanvas)).toBe(true);
	await page.locator('canvas').hover();
	expect(await enable(page)).toBe(0);
	await expect.poll(() => locked(page)).toBe(true);
	await run(page, String.raw`
	SDL_DestroyWindow($window);
	$window=SDL_CreateWindow('Replacement',0,0,29,23,SDL_WINDOW_SHOWN);
	if(!$window) { throw new RuntimeException(SDL_GetError()); }
	`);
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement || !!document.pointerLockElement)).toBe(false);
	await expect.poll(() => run(page, `
	SDL_GetWindowSize($window,$w,$h); echo json_encode([$w,$h,SDL_GetRelativeMouseMode()]);
	`)).toEqual([29,23,false]);
	expect(await page.evaluate(() => [window.pointerCanvas.width,window.pointerCanvas.height])).toEqual([29,23]);
	expect(errors).toEqual([]);
});

test('a retired request rejection cannot set the replacement window error', async ({page}) => {
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	await page.evaluate(() => {
		window.pointerCanvas.requestPointerLock = () => new Promise((resolve, reject) => window.rejectPointer = reject);
	});
	expect(await enable(page)).toBe(0);
	await run(page, `SDL_DestroyWindow($window); ${windowSetup} SDL_ClearError();`);
	await page.evaluate(() => window.rejectPointer(new DOMException('Old request', 'SecurityError')));
	await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
	expect(await run(page, 'echo json_encode([SDL_GetRelativeMouseMode(),SDL_GetError()]);')).toEqual([false,'']);
	expect(errors).toEqual([]);
});

test('synchronous pointer lock rejection returns failure and permits a later retry', async ({page}) => {
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	await page.evaluate(() => {
		window.requestPointer = window.pointerCanvas.requestPointerLock.bind(window.pointerCanvas);
		window.pointerCanvas.requestPointerLock = () => {
			throw new DOMException('Test policy rejection', 'SecurityError');
		};
	});
	const result = await run(page, String.raw`
	SDL_ClearError(); $status=SDL_SetRelativeMouseMode(true);
	echo json_encode([$status,SDL_GetRelativeMouseMode(),SDL_GetError()]);
	`);
	expect(result.slice(0, 2)).toEqual([-1,false]);
	expect(result[2]).toContain('Test policy rejection');
	await page.evaluate(() => window.pointerCanvas.requestPointerLock = window.requestPointer);
	expect(await enable(page)).toBe(0);
	await expect.poll(() => locked(page)).toBe(true);
	expect(await run(page, 'echo json_encode(SDL_GetError());')).toBe('');
	expect(errors).toEqual([]);
});

for(const retry of [false, true])
{
	test(`a late successful request respects the replacement window's ${retry ? 'enabled' : 'disabled'} mode`, async ({page}) => {
		const errors = await initialize(page);
		await run(page, windowSetup);
		await page.locator('canvas').hover();
		await page.evaluate(() => {
			const request = window.pointerCanvas.requestPointerLock.bind(window.pointerCanvas);
			window.pointerRequests = [];
			window.pointerGrants = [];
			window.pointerCanvas.requestPointerLock = () => new Promise((resolve, reject) => {
				window.pointerRequests.push(() => request().then(() => {
					window.pointerGrants.push(window.pointerCanvas.getRootNode().pointerLockElement === window.pointerCanvas);
					resolve();
				}, reject));
			});
		});
		expect(await enable(page)).toBe(0);
		await run(page, `SDL_DestroyWindow($window); ${windowSetup} SDL_ClearError();`);
		await page.locator('canvas').hover();
		if(retry)
		{
			expect(await enable(page)).toBe(0);
		}
		await page.evaluate(() => window.pointerRequests[0]());
		expect(await page.evaluate(() => window.pointerGrants[0])).toBe(true);
		await expect.poll(() => page.evaluate(() => window.pointerEvents.some(event =>
			event.trusted && event.type === 'pointerlockchange'))).toBe(true);
		await expect.poll(() => locked(page)).toBe(retry);
		if(retry)
		{
			await page.evaluate(() => window.pointerRequests[1]());
		}
		expect(await run(page, 'echo json_encode([SDL_GetRelativeMouseMode(),SDL_GetError()]);')).toEqual([retry,'']);
		expect(errors).toEqual([]);
	});
}

test('browser unlock preserves requested mode and a real click reacquires it', async ({page}) => {
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	expect(await enable(page)).toBe(0);
	await expect.poll(() => locked(page)).toBe(true);
	await page.evaluate(() => document.exitPointerLock());
	await expect.poll(() => locked(page)).toBe(false);
	expect(await run(page, 'echo json_encode(SDL_GetRelativeMouseMode());')).toBe(true);
	await page.locator('canvas').click();
	await expect.poll(() => locked(page)).toBe(true);
	expect(errors).toEqual([]);
});

test('a void-returning browser request reports real sandbox denial', async ({page}) => {
	await page.route('**/harness/index.html', async route => {
		const response = await route.fetch();
		await route.fulfill({
			response
			, headers: {
				...response.headers(), 'Content-Security-Policy': 'sandbox allow-scripts allow-same-origin'
			}
		});
	});
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	await page.evaluate(() => {
		const request = window.pointerCanvas.requestPointerLock.bind(window.pointerCanvas);
		// Model the legacy void API; the real browser still emits a trusted error.
		window.pointerCanvas.requestPointerLock = () => { request()?.catch(() => {}); };
	});
	expect(await enable(page)).toBe(0);
	await expect.poll(() => page.evaluate(() => window.pointerEvents.some(event =>
		event.type === 'pointerlockerror' && event.trusted))).toBe(true);
	await expect.poll(() => run(page, 'echo json_encode(SDL_GetError());')).toMatch(/pointer lock.*(denied|failed)/i);
	expect(errors).toEqual([]);
});

test('retired legacy requests release late lock and remove their listeners', async ({page}) => {
	await page.addInitScript(() => {
		const listeners = window.pointerListeners = new Map();
		const add = document.addEventListener;
		const remove = document.removeEventListener;
		document.addEventListener = function(type, listener, options) {
			if(type.startsWith('pointerlock'))
			{
				listeners.set(listener, type);
			}
			return add.call(this, type, listener, options);
		};
		document.removeEventListener = function(type, listener, options) {
			if(type.startsWith('pointerlock'))
			{
				listeners.delete(listener);
			}
			return remove.call(this, type, listener, options);
		};
	});
	const errors = await initialize(page);
	const baseline = await page.evaluate(() => window.pointerListeners.size);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	await page.evaluate(() => {
		const request = window.pointerCanvas.requestPointerLock.bind(window.pointerCanvas);
		window.pointerCanvas.requestPointerLock = () => { window.lateLegacyPointer = request; };
	});
	expect(await enable(page)).toBe(0);
	await run(page, 'SDL_DestroyWindow($window);');
	await page.evaluate(() => window.lateLegacyPointer());
	await expect.poll(() => page.evaluate(() => window.pointerEvents.some(event => event.locked))).toBe(true);
	await expect.poll(() => locked(page)).toBe(false);
	await expect.poll(() => page.evaluate(() => window.pointerListeners.size)).toBe(baseline);
	expect(errors).toEqual([]);
});

test('repeated rejected requests and window restarts keep native allocation counts flat', async ({page}) => {
	const errors = await initialize(page);
	await page.evaluate(() => window.pointerCanvas.requestPointerLock = () => Promise.reject(new DOMException('Churn', 'SecurityError')));
	const samples = [];
	for(let batch = 0; batch < 3; batch++)
	{
		for(let index = 0; index < 20; index++)
		{
			await run(page, windowSetup);
			await page.locator('canvas').hover();
			// This controlled rejection needs no gesture. Keep per-request Vrzno
			// callback allocations out of the native SDL allocation measurement.
			expect(await run(page, 'echo json_encode(SDL_SetRelativeMouseMode(true));')).toBe(0);
			await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
			await run(page, 'SDL_DestroyWindow($window); SDL_Quit(); unset($window); gc_collect_cycles();');
		}
		samples.push(await allocationStats(page));
	}
	expect(samples.map(sample => sample.sdlAllocations)).toEqual(Array(3).fill(samples[0].sdlAllocations));
	expect(samples[2].liveBytes).toBe(samples[1].liveBytes);
	expect(errors).toEqual([]);
});

for(const legacy of [false, true])
{
	test(`${legacy ? 'void' : 'Promise'} rejection sets SDL error before an application event handler reads it`, async ({page}) => {
		await page.route('**/harness/index.html', async route => {
			const response = await route.fetch();
			await route.fulfill({
				response
				, headers: {
					...response.headers(), 'Content-Security-Policy': 'sandbox allow-scripts allow-same-origin'
				}
			});
		});
		const errors = await initialize(page);
		await run(page, windowSetup);
		await page.locator('canvas').hover();
		await run(page, String.raw`
		$browser=new Vrzno;
		$browser->pointerErrorCallback=function() use($browser) {
			$browser->pointerErrorInCallback=SDL_GetError();
		};
		`);
		await page.evaluate(legacy => {
			document.addEventListener('pointerlockerror', window.pointerErrorCallback);
			if(legacy)
			{
				const request = window.pointerCanvas.requestPointerLock.bind(window.pointerCanvas);
				window.pointerCanvas.requestPointerLock = () => { request()?.catch(() => {}); };
			}
		}, legacy);
		try
		{
			expect(await enable(page)).toBe(0);
			await expect.poll(() => page.evaluate(() => window.pointerErrorInCallback)).toMatch(/pointer lock.*(denied|failed)/i);
			expect(errors).toEqual([]);
		}
		finally
		{
			await page.evaluate(() => document.removeEventListener('pointerlockerror', window.pointerErrorCallback));
		}
	});
}

test('non-Error browser failures produce SDL diagnostics without JavaScript exceptions', async ({page}) => {
	const errors = await initialize(page);
	await run(page, windowSetup);
	await page.locator('canvas').hover();
	for(const asynchronous of [false, true])
	{
		await page.evaluate(asynchronous => {
			window.pointerCanvas.requestPointerLock = () => {
				if(asynchronous)
				{
					return Promise.reject(null);
				}
				throw null;
			};
		}, asynchronous);
		expect(await run(page, 'SDL_ClearError(); echo json_encode(SDL_SetRelativeMouseMode(true));')).toBe(asynchronous ? 0 : -1);
		await expect.poll(() => run(page, 'echo json_encode(SDL_GetError());')).toContain('pointer lock request failed: null');
		expect(await run(page, 'echo json_encode(SDL_GetRelativeMouseMode());')).toBe(asynchronous);
		await run(page, 'SDL_SetRelativeMouseMode(false);');
	}
	expect(errors).toEqual([]);
});
