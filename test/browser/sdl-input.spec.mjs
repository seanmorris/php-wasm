import {test, expect} from '@playwright/test';
import {start, run, windowSetup} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.use({hasTouch: true});
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const poll = String.raw`
$events=[]; $event=new SDL_Event;
while(SDL_PollEvent($event)) {
	foreach(['key','text','edit','window','tfinger','cdevice','cbutton','caxis'] as $field) {
		if(isset($event->$field)) { $events[]=[$field,$event->$field]; }
	}
}
echo json_encode(['events'=>$events,'held'=>array_keys(array_filter(SDL_GetKeyboardState())),
	'mod'=>SDL_GetModState(),'flags'=>SDL_GetWindowFlags($window)]);
`;
const cleanup = 'SDL_DestroyWindow($window); SDL_Quit();';

/**
 * Run PHP without Playwright's implicit browser user activation.
 * @param {import('@playwright/test').CDPSession} client Browser protocol session.
 * @param {string} source PHP source without its opening tag.
 * @returns {Promise<unknown>} Decoded PHP output.
 */
const withoutGesture = async (client, source) => {
	const expression = `(async()=>{
		window.bindingOutput=window.bindingErrors='';
		const status=await window.bindingPhp.run(${JSON.stringify(`<?php ${source}`)});
		return {status,output:window.bindingOutput,errors:window.bindingErrors};
	})()`;
	const response = await client.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture: false});
	expect(response.exceptionDetails).toBeUndefined();
	expect(response.result.value.errors).toBe('');
	expect(response.result.value.status).toBe(0);
	return response.result.value.output ? JSON.parse(response.result.value.output) : null;
};

/**
 * Read DOM state without renewing transient user activation.
 * @param {import('@playwright/test').CDPSession} client Browser protocol session.
 * @param {string} expression JavaScript expression to evaluate.
 * @returns {Promise<unknown>} Copied browser value.
 */
const browserState = async (client, expression) => {
	const response = await client.send('Runtime.evaluate', {expression, returnByValue: true, userGesture: false});
	expect(response.exceptionDetails).toBeUndefined();
	return response.result.value;
};

test('real browser blur releases held keys and produces native focus events', async ({page, context}) => {
	await start(page);
	const client = await context.newCDPSession(page);
	// Playwright normally forces every tab to remain focused.
	await client.send('Emulation.setFocusEmulationEnabled', {enabled: false});
	await page.bringToFront();
	await run(page, windowSetup);
	await run(page, poll);
	await page.locator('canvas').focus();
	await page.keyboard.down('Shift');
	await page.keyboard.down('a');
	expect((await run(page, poll)).held).toEqual([4, 225]);

	const other = await context.newPage();
	try
	{
		const otherClient = await context.newCDPSession(other);
		await otherClient.send('Emulation.setFocusEmulationEnabled', {enabled: false});
		await other.goto('about:blank');
		await other.bringToFront();
		await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
		const lost = await run(page, poll);
		expect(lost.held).toEqual([]);
		expect(lost.mod).toBe(0);
		expect(lost.flags & 0x200).toBe(0);
		expect(lost.events.filter(([kind]) => kind === 'key').map(([,event]) => [event.state,event.keysym.scancode])).toEqual([[0,4],[0,225]]);
		expect(lost.events).toContainEqual(['window', expect.objectContaining({event: 13})]);

		await page.bringToFront();
		await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
		const resumed = await run(page, poll);
		expect(resumed.held).toEqual([]);
		expect(resumed.flags & 0x200).toBe(0x200);
		expect(resumed.events).toContainEqual(['window', expect.objectContaining({event: 12})]);
		await page.keyboard.up('a');
		await page.keyboard.up('Shift');
		await run(page, cleanup);
	}
	finally
	{
		await other.close();
	}
});

test('real touch motion and cancellation preserve native finger identity and coordinates', async ({page, context}) => {
	await start(page);
	await run(page, windowSetup);
	await run(page, poll);
	const client = await context.newCDPSession(page);
	const bounds = await page.locator('canvas').boundingBox();
	const first = {id: 7, x: bounds.x + 16, y: bounds.y + 24};
	await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [first]});
	await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{...first, x: bounds.x + 32, y: bounds.y + 40}]});
	await client.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
	const fingers = (await run(page, poll)).events.filter(([kind]) => kind === 'tfinger').map(([,event]) => event);
	expect(fingers.map(({type}) => type)).toEqual([1792,1794,1793]);
	expect(fingers[0]).toMatchObject({fingerId: 7, x: .25, y: .375, dx: 0, dy: 0, pressure: 1});
	expect(fingers[1]).toMatchObject({fingerId: 7, x: .5, y: .625, dx: .25, dy: .25, pressure: 1});
	expect(fingers[2]).toMatchObject({fingerId: 7, x: .5, y: .625});
	await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [first]});
	await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
	expect((await run(page, poll)).events.filter(([kind]) => kind === 'tfinger').map(([,event]) => event.type)).toEqual([1792,1793]);
	await run(page, cleanup);
});

for(const placement of ['no ID', 'custom ID with decoy', 'shadow root'])
{
	test(`fullscreen enters and restores the supplied canvas with ${placement}`, async ({page}) => {
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		await start(page);
		await page.evaluate(placement => {
			const canvas = window.inputCanvas = document.querySelector('canvas');
			canvas.style.width = '80px';
			canvas.style.height = '72px';
			if(placement === 'custom ID with decoy')
			{
				canvas.id = 'SDL canvas:1';
				const decoy = document.createElement('canvas');
				decoy.id = 'canvas';
				decoy.width = decoy.height = 8;
				document.body.append(decoy);
			}
			if(placement === 'shadow root')
			{
				const host = document.createElement('div');
				document.body.append(host);
				host.attachShadow({mode: 'open'}).append(canvas);
			}
		}, placement);
		await run(page, String.raw`
		SDL_Init(SDL_INIT_VIDEO);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
		$window=SDL_CreateWindow('Fullscreen',0,0,64,64,SDL_WINDOW_OPENGL|SDL_WINDOW_SHOWN);
		$gl=SDL_GL_CreateContext($window);
		if(!$gl) { throw new RuntimeException(SDL_GetError()); }
		$browser=new Vrzno;
		$browser->inputOutcome=null;
		$browser->inputCallback=function() use($window,$browser) {
			$browser->inputOutcome=json_encode(SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP));
		};
		`);
		await page.evaluate(() => window.inputCanvas.addEventListener('click', window.inputCallback));
		const before = await page.evaluate(() => ({width: window.inputCanvas.width, height: window.inputCanvas.height, css: window.inputCanvas.style.cssText, id: window.inputCanvas.id}));
		const canvas = placement === 'custom ID with decoy' ? page.locator('canvas').first() : page.locator('canvas');
		await canvas.click();
		await expect.poll(() => page.evaluate(() => window.inputOutcome), {timeout: 2500}).toBe('0');
		await expect.poll(() => page.evaluate(() => window.inputCanvas.getRootNode().fullscreenElement === window.inputCanvas)).toBe(true);
		expect(await run(page, 'echo json_encode((SDL_GetWindowFlags($window)&SDL_WINDOW_FULLSCREEN_DESKTOP)===SDL_WINDOW_FULLSCREEN_DESKTOP);')).toBe(true);
		const fullSize = await page.evaluate(() => [screen.width,screen.height]);
		expect(await page.evaluate(() => [window.inputCanvas.width,window.inputCanvas.height])).toEqual(fullSize);
		expect(await run(page, `
		glClearColor(1,0,0,1); glClear(GL_COLOR_BUFFER_BIT);
		echo json_encode([glGetIntegerv(GL_VIEWPORT),bin2hex(glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE)),glGetError()]);
		`)).toEqual([[0,0,...fullSize],'ff0000ff',0]);
		await page.evaluate(async () => document.exitFullscreen());
		await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
		await expect.poll(() => page.evaluate(() => ({width: window.inputCanvas.width, height: window.inputCanvas.height, css: window.inputCanvas.style.cssText, id: window.inputCanvas.id}))).toEqual(before);
		expect(await run(page, 'echo json_encode(SDL_GetWindowFlags($window)&SDL_WINDOW_FULLSCREEN_DESKTOP);')).toBe(0);
		expect(await run(page, `
		glClearColor(0,1,0,1); glClear(GL_COLOR_BUFFER_BIT);
		echo json_encode([glGetIntegerv(GL_VIEWPORT),bin2hex(glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE)),glGetError()]);
		`)).toEqual([[0,0,64,64],'00ff00ff',0]);
		if(placement === 'custom ID with decoy')
		{
			expect(await page.locator('#canvas').evaluate(canvas => [canvas.width,canvas.height])).toEqual([8,8]);
		}
		await page.evaluate(() => window.inputCanvas.removeEventListener('click', window.inputCallback));
		await run(page, cleanup);
		expect(errors).toEqual([]);
	});
}

test('fullscreen requests defer until a gesture and can be cancelled before activation', async ({page, context}) => {
	await start(page);
	await run(page, windowSetup);
	const client = await context.newCDPSession(page);
	await expect.poll(() => browserState(client, 'navigator.userActivation.isActive'), {timeout: 7500}).toBe(false);
	expect(await withoutGesture(client, 'echo json_encode(SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP));')).toBe(0);
	expect(await browserState(client, '!!document.fullscreenElement')).toBe(false);
	expect(await withoutGesture(client, 'echo json_encode(SDL_SetWindowFullscreen($window,0));')).toBe(0);
	await page.locator('canvas').click();
	expect(await browserState(client, '!!document.fullscreenElement')).toBe(false);

	await expect.poll(() => browserState(client, 'navigator.userActivation.isActive'), {timeout: 7500}).toBe(false);
	expect(await withoutGesture(client, 'echo json_encode(SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP));')).toBe(0);
	expect(await browserState(client, '!!document.fullscreenElement')).toBe(false);
	await page.locator('canvas').click();
	await expect.poll(() => browserState(client, 'document.fullscreenElement === document.querySelector("canvas")')).toBe(true);
	expect(await withoutGesture(client, 'echo json_encode(SDL_SetWindowFullscreen($window,0));')).toBe(0);
	await expect.poll(() => browserState(client, '!!document.fullscreenElement')).toBe(false);
	// The DOM flag changes before fullscreenchange delivers SDL's resize.
	await expect.poll(() => run(page, 'SDL_GetWindowSize($window,$width,$height); echo json_encode([$width,$height]);')).toEqual([64,64]);
	await run(page, cleanup);
});

test('fullscreen blocked by browser policy returns a native error without changing flags', async ({page}) => {
	await page.route('**/harness/index.html', async route => {
		const response = await route.fetch();
		await route.fulfill({response, headers: {...response.headers(), 'Permissions-Policy': 'fullscreen=()'}});
	});
	await start(page);
	expect(await page.evaluate(() => document.fullscreenEnabled)).toBe(false);
	const result = await run(page, String.raw`${windowSetup}
	SDL_ClearError(); $status=SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP);
	$error=SDL_GetError(); $flags=SDL_GetWindowFlags($window)&SDL_WINDOW_FULLSCREEN_DESKTOP;
	echo json_encode(compact('status','error','flags')); ${cleanup}
	`);
	expect(result.status).toBe(-1);
	expect(result.flags).toBe(0);
	expect(result.error).toMatch(/fullscreen.*(unavailable|blocked|unsupported)/i);
});

for(const mode of ['destroy', 'video quit', 'PHP refresh'])
{
	for(const pending of [false, true])
	{
		test(`${pending ? 'pending' : 'active'} fullscreen cleanup survives ${mode} and immediate window recreation`, async ({page, context}) => {
			const errors = [];
			page.on('pageerror', error => errors.push(error.message));
			await start(page);
			await run(page, String.raw`
			SDL_Init(SDL_INIT_VIDEO);
			SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
			SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3);
			SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
			$window=SDL_CreateWindow('Old',0,0,64,64,SDL_WINDOW_OPENGL|SDL_WINDOW_SHOWN);
			$gl=SDL_GL_CreateContext($window);
			if(!$gl) { throw new RuntimeException(SDL_GetError()); }
			$browser=new Vrzno;
			$browser->inputCallback=function() use($window) {
				SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP);
			};
			`);
			const client = await context.newCDPSession(page);
			if(pending)
			{
				await expect.poll(() => browserState(client, 'navigator.userActivation.isActive'), {timeout: 7500}).toBe(false);
				expect(await withoutGesture(client, 'echo json_encode(SDL_SetWindowFullscreen($window,SDL_WINDOW_FULLSCREEN_DESKTOP));')).toBe(0);
				expect(await browserState(client, '!!document.fullscreenElement')).toBe(false);
			}
			else
			{
				await page.evaluate(() => document.querySelector('canvas').addEventListener('click', window.inputCallback, {once: true}));
				await page.locator('canvas').click();
				await expect.poll(() => browserState(client, '!!document.fullscreenElement')).toBe(true);
			}
			if(mode === 'PHP refresh')
			{
				await page.evaluate(() => window.bindingPhp.refresh());
			}
			await run(page, `
			${mode === 'destroy' ? 'SDL_DestroyWindow($window);' : mode === 'video quit' ? 'SDL_Quit();' : ''}
			${mode === 'destroy' ? '' : 'SDL_Init(SDL_INIT_VIDEO);'}
			SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
			SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3);
			SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
			$next=SDL_CreateWindow('Recreated',0,0,23,17,SDL_WINDOW_OPENGL|SDL_WINDOW_SHOWN);
			if(!$next) { throw new RuntimeException(SDL_GetError()); }
			$nextGl=SDL_GL_CreateContext($next);
			if(!$nextGl) { throw new RuntimeException(SDL_GetError()); }
			glViewport(0,0,23,17);
			`);
			await expect.poll(() => browserState(client, '!!document.fullscreenElement')).toBe(false);
			// Let exit notifications and queued native resize callbacks finish.
			await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			await page.locator('canvas').click();
			expect(await browserState(client, '!!document.fullscreenElement')).toBe(false);
			expect(await page.locator('canvas').evaluate(canvas => [canvas.width,canvas.height])).toEqual([23,17]);
			expect(await run(page, String.raw`
			SDL_GetWindowSize($next,$width,$height);
			glClearColor(0,1,0,1); glClear(GL_COLOR_BUFFER_BIT);
			echo json_encode([$width,$height,SDL_GetWindowFlags($next)&SDL_WINDOW_FULLSCREEN_DESKTOP,
				glGetIntegerv(GL_VIEWPORT),bin2hex(glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE)),glGetError()]);
			SDL_DestroyWindow($next); SDL_Quit();
			`)).toEqual([23,17,0,[0,0,23,17],'00ff00ff',0]);
			expect(errors).toEqual([]);
		});
	}
}

test('controller reconnection at a reused browser index keeps old handles detached', async ({page}) => {
	await page.addInitScript(() => {
		window.inputPad = {
			id: 'Standard Gamepad'
			, index: 0, connected: true, mapping: 'standard', timestamp: 1
			, axes: [0,0,0,0]
			, buttons: Array.from({length: 17}, () => ({pressed: false, touched: false, value: 0}))
		};
		Object.defineProperty(navigator, 'getGamepads', {value: () => window.inputPad.connected ? [window.inputPad] : []});
	});
	await start(page);
	const initial = await run(page, String.raw`${windowSetup}
	$old=SDL_GameControllerOpen(0); $oldJoy=SDL_GameControllerGetJoystick($old);
	$id=SDL_JoystickInstanceID($oldJoy); echo json_encode($id);
	`);
	await run(page, poll);
	await page.evaluate(() => {
		window.inputPad.connected = false;
		window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), {gamepad: window.inputPad}));
	});
	expect(await run(page, 'SDL_GameControllerUpdate(); echo json_encode([SDL_NumJoysticks(),SDL_GameControllerGetAttached($old),SDL_JoystickGetAttached($oldJoy)]);')).toEqual([0,false,false]);
	const detached = await run(page, poll);
	expect(detached.events).toContainEqual(['cdevice', expect.objectContaining({type: 1620, which: initial})]);
	await page.evaluate(() => {
		window.inputPad = {...window.inputPad, connected: true, timestamp: 2};
		window.dispatchEvent(Object.assign(new Event('gamepadconnected'), {gamepad: window.inputPad}));
	});
	const reconnected = await run(page, String.raw`
	SDL_GameControllerUpdate(); $next=SDL_GameControllerOpen(0); $nextJoy=SDL_GameControllerGetJoystick($next);
	echo json_encode([SDL_NumJoysticks(),SDL_GameControllerGetAttached($old),SDL_GameControllerGetAttached($next),SDL_JoystickInstanceID($nextJoy)]);
	`);
	expect(reconnected.slice(0,3)).toEqual([1,false,true]);
	expect(reconnected[3]).not.toBe(initial);
	await page.evaluate(() => {
		window.inputPad.buttons[0] = {pressed: true, touched: true, value: 1};
		window.inputPad.timestamp++;
	});
	expect(await run(page, String.raw`
	SDL_GameControllerUpdate();
	$before=[SDL_GameControllerGetButton($old,0),SDL_GameControllerGetButton($next,0)];
	SDL_GameControllerClose($old); SDL_JoystickClose($oldJoy);
	echo json_encode([$before,SDL_GameControllerGetAttached($next),SDL_JoystickGetAttached($nextJoy)]);
	SDL_GameControllerClose($next); SDL_JoystickClose($nextJoy); ${cleanup}
	`)).toEqual([[0,1],true,true]);
});
