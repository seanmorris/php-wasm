import {test, expect} from '@playwright/test';
import {start, run, windowSetup, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const poll = String.raw`
$events=[]; $event=new SDL_Event;
while(SDL_PollEvent($event)) {
	foreach(['key','text','edit'] as $kind) {
		if(isset($event->$kind)) { $events[]=[$kind,$event->$kind]; }
	}
}
echo json_encode($events,JSON_THROW_ON_ERROR);
`;

/**
 * Select native event payloads without accepting malformed UTF-8 in PHP JSON.
 * @param {import('@playwright/test').Page} page Browser runtime.
 * @param {string} kind SDL event payload name.
 * @returns {Promise<object[]>} Matching native event payloads.
 */
const events = async (page, kind) => (await run(page, poll))
	.filter(([name]) => name === kind).map(([,event]) => event);

/**
 * Keep keyboard focus inside the SDL-owned editing surface.
 * @param {import('@playwright/test').Page} page Browser runtime.
 * @returns {Promise<void>} Resolves after native text input starts.
 */
const begin = async page => {
	await run(page, 'SDL_StartTextInput();');
	await run(page, poll);
};

test('default keypress preserves astral Unicode and replaces unmatched surrogates', async ({page, context}) => {
	await start(page);
	await run(page, windowSetup);
	await page.locator('canvas').focus();
	expect(await page.locator('textarea').count()).toBe(0);
	expect(await page.locator('canvas').evaluate(canvas => !!canvas.editContext)).toBe(false);
	await run(page, poll);
	const client = await context.newCDPSession(page);
	await client.send('Input.dispatchKeyEvent', {type: 'char', text: '😀', key: '😀'});
	expect((await events(page, 'text')).map(event => event.text)).toEqual(['😀']);
	// Some legacy keypresses expose only one UTF-16 surrogate, with no full key.
	await page.locator('canvas').evaluate(canvas => canvas.dispatchEvent(new KeyboardEvent('keypress', {
		bubbles: true, charCode: 0xD83D
	})));
	expect((await events(page, 'text')).map(event => event.text)).toEqual(['�']);
});

for(const backend of ['EditContext', 'textarea fallback'])
{
	test.describe(backend, () => {
		test.beforeEach(async ({page}) => {
			if(backend === 'textarea fallback')
			{
				await page.addInitScript(() => window.EditContext = undefined);
			}
			await start(page);
			if(backend === 'EditContext')
			{
				expect(await page.evaluate(() => typeof EditContext)).toBe('function');
			}
			await run(page, windowSetup);
		});

		for(const initialize of ['SDL_Init(SDL_INIT_VIDEO)', 'SDL_VideoInit()'])
		{
			test(`explicit text start before window creation survives ${initialize}`, async ({page}) => {
				await run(page, 'SDL_Quit();');
				expect(await run(page, `echo json_encode(${initialize});`)).toBe(0);
				await run(page, `
				SDL_StartTextInput();
				$window=SDL_CreateWindow('Deferred text',0,0,64,64,SDL_WINDOW_SHOWN);
				if(!$window) { throw new RuntimeException(SDL_GetError()); }
				`);
				await page.locator('canvas').focus();
				await run(page, poll);
				await page.keyboard.insertText('Before😀');
				expect((await events(page, 'text')).map(event => event.text)).toEqual(['Before😀']);
				await run(page, `
				SDL_DestroyWindow($window);
				SDL_StartTextInput(); SDL_StopTextInput();
				$window=SDL_CreateWindow('Cancelled text',0,0,64,64,SDL_WINDOW_SHOWN);
				if(!$window) { throw new RuntimeException(SDL_GetError()); }
				`);
				expect(await page.locator('textarea').count()).toBe(0);
				expect(await page.locator('canvas').evaluate(canvas => !!canvas.editContext)).toBe(false);
				await page.locator('canvas').focus();
				await page.keyboard.type('a');
				expect(await events(page, 'text')).toEqual([]);
				await begin(page);
				await page.keyboard.insertText('Resumed😀');
				expect((await events(page, 'text')).map(event => event.text)).toEqual(['Resumed😀']);
			});
		}

		test('receives composition and Unicode in PHP animation callbacks', async ({page, context}) => {
			await begin(page);
			await run(page, String.raw`
			$browser=new Vrzno; $browser->textFramesDone=false;
			$texts=[]; $edits=[]; $frames=0; $event=new SDL_Event;
			$deadline=SDL_GetTicks64()+10000;
			$frame=function() use (&$frame,$browser,&$texts,&$edits,&$frames,$event,$deadline) {
				$frames++;
				$browser->textAnimationFrames=$frames;
				while(SDL_PollEvent($event)) {
					if(isset($event->edit)) { $edits[]=$event->edit; }
					if(isset($event->text)) { $texts[]=$event->text->text; }
				}
				if($texts || SDL_GetTicks64()>=$deadline) {
					$browser->textFrameResult=json_encode(compact('texts','edits','frames'),JSON_THROW_ON_ERROR);
					$browser->textFramesDone=true;
					return;
				}
				$browser->textAnimation=$browser->requestAnimationFrame($frame);
			};
			$browser->textAnimation=$browser->requestAnimationFrame($frame);
			`);
			try
			{
				await expect.poll(() => page.evaluate(() => window.textAnimationFrames)).toBeGreaterThan(1);
				const client = await context.newCDPSession(page);
				await client.send('Input.imeSetComposition', {text: '日😀本', selectionStart: 1, selectionEnd: 3});
				await client.send('Input.insertText', {text: 'Frame😀'});
				await expect.poll(() => page.evaluate(() => window.textFramesDone)).toBe(true);
				const result = await page.evaluate(() => ({
					output: window.textFrameResult, errors: window.bindingErrors
				}));
				expect(result.errors).toBe('');
				const output = JSON.parse(result.output);
				expect(output.texts).toEqual(['Frame😀']);
				expect(output.edits).toContainEqual(expect.objectContaining({text: '日😀本', start: 1, length: 1}));
				expect(output.frames).toBeGreaterThan(1);
			}
			finally
			{
				await page.evaluate(() => cancelAnimationFrame(window.textAnimation));
			}
		});

		test('receives composition and Unicode while a PHP frame loop is suspended', async ({page, context}) => {
			await begin(page);
			await page.evaluate(() => {
				window.bindingOutput = window.bindingErrors = '';
				window.textNextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
				window.textFrameLoop = window.bindingPhp.run(String.raw`<?php
				$browser=new Vrzno; $browser->textFramesReady=true;
				$texts=[]; $edits=[]; $frames=0; $event=new SDL_Event;
				$deadline=SDL_GetTicks64()+10000;
				do {
					$frames++;
					while(SDL_PollEvent($event)) {
						if(isset($event->edit)) { $edits[]=$event->edit; }
						if(isset($event->text)) { $texts[]=$event->text->text; }
					}
					if($texts) { break; }
					vrzno_await($browser->textNextFrame());
				} while(SDL_GetTicks64()<$deadline);
				echo json_encode(compact('texts','edits','frames'),JSON_THROW_ON_ERROR);
				`);
			});
			await expect.poll(() => page.evaluate(() => window.textFramesReady)).toBe(true);
			const client = await context.newCDPSession(page);
			await client.send('Input.imeSetComposition', {text: '日😀本', selectionStart: 1, selectionEnd: 3});
			await client.send('Input.insertText', {text: 'Frame😀'});
			const result = await page.evaluate(async () => ({
				status: await window.textFrameLoop
				, output: window.bindingOutput, errors: window.bindingErrors
			}));
			expect(result.status).toBe(0);
			expect(result.errors).toBe('');
			const output = JSON.parse(result.output);
			expect(output.texts).toEqual(['Frame😀']);
			expect(output.edits).toContainEqual(expect.objectContaining({text: '日😀本', start: 1, length: 1}));
			expect(output.frames).toBeGreaterThan(1);
		});

		test('commits complete Unicode in native UTF-8 chunks and keeps physical key events', async ({page}) => {
			await begin(page);
			await page.keyboard.type('abc');
			const typed = await run(page, poll);
			expect(typed.filter(([kind]) => kind === 'text').map(([,event]) => event.text)).toEqual(['a','b','c']);
			expect(typed.filter(([kind]) => kind === 'key').map(([,event]) => [event.state,event.keysym.scancode]))
				.toEqual([[1,4],[0,4],[1,5],[0,5],[1,6],[0,6]]);
			const text = 'é😀日本語'.repeat(19);
			await page.keyboard.insertText(text);
			const committed = await events(page, 'text');
			expect(committed.length).toBeGreaterThan(1);
			expect(committed.map(event => event.text).join('')).toBe(text);
			for(const event of committed)
			{
				expect(Buffer.byteLength(event.text)).toBeLessThanOrEqual(31);
				expect(event.windowID).toBe(await run(page, 'echo json_encode(SDL_GetWindowID($window));'));
			}
		});

		test('IME selection uses codepoints and commit is delivered once', async ({page, context}) => {
			await begin(page);
			const client = await context.newCDPSession(page);
			await client.send('Input.imeSetComposition', {text: '日😀本', selectionStart: 1, selectionEnd: 3});
			expect(await events(page, 'edit')).toContainEqual(expect.objectContaining({text: '日😀本', start: 1, length: 1}));
			await client.send('Input.insertText', {text: '日本語'});
			const committed = await run(page, poll);
			expect(committed.filter(([kind]) => kind === 'text').map(([,event]) => event.text)).toEqual(['日本語']);
			expect(committed.filter(([kind]) => kind === 'edit').at(-1)[1]).toMatchObject({text: '', start: 0, length: 0});
			await client.send('Input.insertText', {text: '日本語'});
			expect((await events(page, 'text')).map(event => event.text)).toEqual(['日本語']);
		});

		test('cancelled composition does not commit and a new composition still works', async ({page, context}) => {
			await begin(page);
			const client = await context.newCDPSession(page);
			await client.send('Input.imeSetComposition', {text: '未確定', selectionStart: 3, selectionEnd: 3});
			await run(page, poll);
			await client.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
			const cancelled = await run(page, poll);
			expect(cancelled.filter(([kind]) => kind === 'text')).toEqual([]);
			expect(cancelled.filter(([kind]) => kind === 'edit').at(-1)[1]).toMatchObject({text: ''});
			await client.send('Input.imeSetComposition', {text: '再開', selectionStart: 2, selectionEnd: 2});
			await client.send('Input.insertText', {text: '再開😀'});
			expect((await events(page, 'text')).map(event => event.text)).toEqual(['再開😀']);
		});

		test('stop cancels input, repeated start is idempotent, and other controls retain focus', async ({page, context}) => {
			await begin(page);
			const client = await context.newCDPSession(page);
			await client.send('Input.imeSetComposition', {text: '未確定', selectionStart: 3, selectionEnd: 3});
			await run(page, poll);
			await run(page, 'SDL_StopTextInput();');
			await page.keyboard.type('a');
			expect(await events(page, 'text')).toEqual([]);
			expect(await run(page, 'echo json_encode(SDL_IsTextInputActive());')).toBe(false);
			await run(page, 'SDL_StartTextInput(); SDL_StartTextInput();');
			await page.keyboard.insertText('Single😀');
			expect((await events(page, 'text')).map(event => event.text)).toEqual(['Single😀']);
			expect(await page.locator('textarea').count()).toBe(backend === 'textarea fallback' ? 1 : 0);
			await page.evaluate(() => {
				const button = document.createElement('button');
				button.textContent = 'Elsewhere';
				document.body.append(button);
				button.focus();
			});
			await run(page, 'SDL_StopTextInput();');
			expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Elsewhere');
			expect(await page.locator('textarea').count()).toBe(0);
		});

		test('candidate rectangle follows CSS scaling and a canvas inside a shadow root', async ({page}) => {
			await page.evaluate(() => {
				const canvas = document.querySelector('canvas');
				const host = document.createElement('div');
				document.body.append(host);
				host.attachShadow({mode: 'open'}).append(canvas);
				canvas.style.width = '128px';
				canvas.style.height = '96px';
				if(typeof EditContext === 'function')
				{
					const update = EditContext.prototype.updateSelectionBounds;
					EditContext.prototype.updateSelectionBounds = function(rect) {
						window.candidateRect = [rect.x,rect.y,rect.width,rect.height];
						return update.call(this, rect);
					};
				}
			});
			await begin(page);
			await run(page, 'SDL_SetTextInputRect(new SDL_Rect(5,7,11,13));');
			const bounds = await page.locator('canvas').boundingBox();
			const rect = await page.evaluate(() => {
				if(window.candidateRect)
				{
					return window.candidateRect;
				}
				const field = document.querySelector('div').shadowRoot.querySelector('textarea');
				const {x,y,width,height} = field.getBoundingClientRect();
				return [x,y,width,height];
			});
			expect(rect).toEqual([bounds.x+10,bounds.y+10.5,22,19.5]);
			await page.keyboard.insertText('Shadow😀');
			expect((await events(page, 'text')).map(event => event.text)).toEqual(['Shadow😀']);
		});

		for(const teardown of ['SDL_DestroyWindow($window);', 'SDL_VideoQuit();', 'SDL_Quit();', 'PHP refresh'])
		{
			test(`composition callbacks are retired across ${teardown}`, async ({page, context}) => {
				const errors = [];
				page.on('pageerror', error => errors.push(error.message));
				await begin(page);
				const client = await context.newCDPSession(page);
				await client.send('Input.imeSetComposition', {text: '古い', selectionStart: 2, selectionEnd: 2});
				await page.evaluate(() => {
					window.oldTextTarget = document.querySelector('canvas').editContext ?? document.querySelector('textarea');
				});
				if(teardown === 'PHP refresh')
				{
					await page.evaluate(async () => window.bindingPhp.refresh());
				}
				else
				{
					await run(page, teardown);
				}
				expect(await page.locator('textarea').count()).toBe(0);
				expect(await page.locator('canvas').evaluate(canvas => !!canvas.editContext)).toBe(false);
				if(teardown === 'SDL_VideoQuit();')
				{
					// This low-level API does not clear SDL_Init's subsystem refcount.
					expect(await run(page, 'echo json_encode(SDL_VideoInit());')).toBe(0);
				}
				await run(page, windowSetup);
				await begin(page);
				await page.evaluate(() => {
					window.oldTextTarget.dispatchEvent(new CompositionEvent('compositionend', {data: '古い'}));
					window.oldTextTarget.dispatchEvent(new InputEvent('input', {data: '古い', inputType: 'insertText'}));
					window.oldTextTarget.dispatchEvent(new Event('textupdate'));
				});
				expect(await events(page, 'text')).toEqual([]);
				await page.keyboard.insertText('New😀');
				expect((await events(page, 'text')).map(event => event.text)).toEqual(['New😀']);
				expect(errors).toEqual([]);
			});
		}

		for(const create of ['SDL_CreateWindow', 'new SDL_Window'])
		{
			test(`${create} preserves a replacement created by a reentrant browser focus callback`, async ({page}) => {
				await run(page, 'SDL_Quit();');
				await page.evaluate(() => {
					const button = document.createElement('button');
					document.body.append(button);
					button.focus();
				});
				await run(page, String.raw`
				SDL_Init(SDL_INIT_VIDEO); SDL_StartTextInput();
				$replacement=null; $focusCalls=0; $browser=new Vrzno;
				$browser->textFocusCallback=function() use(&$replacement,&$focusCalls) {
					$focusCalls++;
					SDL_DestroyWindow(SDL_GetKeyboardFocus());
					$replacement=SDL_CreateWindow('Replacement',0,0,29,23,SDL_WINDOW_SHOWN);
				};
				`);
				await page.evaluate(() => document.addEventListener('focusin', window.textFocusCallback, {once: true}));
				const result = await run(page, `
				SDL_ClearError(); $failure=null;
				try { $created=${create}('Reentrant focus',0,0,64,64,SDL_WINDOW_SHOWN); }
				catch(Throwable $error) { $failure=[get_class($error),$error->getMessage()]; }
				SDL_GetWindowSize($replacement,$width,$height);
				echo json_encode(['calls'=>$focusCalls,'failure'=>$failure,'size'=>[$width,$height],'error'=>SDL_GetError()]);
				`);
				expect(result).toEqual({calls: 1, failure: ['Error','SDL_Window changed during a PHP callback'], size: [29,23], error: ''});
				await begin(page);
				await page.keyboard.insertText('Replacement😀');
				const replacement = await events(page, 'text');
				expect(replacement.map(event => event.text)).toEqual(['Replacement😀']);
				expect(replacement[0].windowID).toBe(await run(page, 'echo json_encode(SDL_GetWindowID($replacement));'));
			});
		}

		test('repeated start/stop releases editing listeners and has stable native allocation counts', async ({page}) => {
			await page.evaluate(() => {
				window.textListeners = new Set();
				const add = EventTarget.prototype.addEventListener;
				const remove = EventTarget.prototype.removeEventListener;
				const owned = target => target instanceof HTMLTextAreaElement
					|| typeof EditContext === 'function' && target instanceof EditContext;
				EventTarget.prototype.addEventListener = function(type, listener, options) {
					if(owned(this))
					{
						window.textListeners.add(listener);
					}
					return add.call(this, type, listener, options);
				};
				EventTarget.prototype.removeEventListener = function(type, listener, options) {
					if(owned(this))
					{
						window.textListeners.delete(listener);
					}
					return remove.call(this, type, listener, options);
				};
			});
			const samples = [];
			for(let batch = 0; batch < 3; batch++)
			{
				await run(page, 'for($i=0;$i<60;$i++) { SDL_StartTextInput(); SDL_StopTextInput(); }');
				await run(page, poll);
				samples.push(await allocationStats(page));
				expect(await page.evaluate(() => window.textListeners.size)).toBe(0);
				expect(await page.locator('textarea').count()).toBe(0);
			}
			expect(samples.map(sample => sample.sdlAllocations)).toEqual(Array(3).fill(samples[0].sdlAllocations));
			expect(samples[2].liveBytes).toBe(samples[1].liveBytes);
			await begin(page);
			await page.keyboard.type('a');
			expect((await events(page, 'text')).map(event => event.text)).toEqual(['a']);
		});
	});
}

test('EditContext delivers Unicode on the actual fullscreen SDL canvas', async ({page}) => {
	await start(page);
	await run(page, windowSetup);
	await page.locator('canvas').evaluate(canvas => canvas.addEventListener('click', () => canvas.requestFullscreen(), {once: true}));
	await page.locator('canvas').click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.querySelector('canvas'))).toBe(true);
	await begin(page);
	await page.keyboard.insertText('Fullscreen😀');
	expect((await events(page, 'text')).map(event => event.text)).toEqual(['Fullscreen😀']);
	await page.evaluate(() => document.exitFullscreen());
});

test('fallback reports the fullscreen IME limitation and resumes after fullscreen', async ({page}) => {
	await page.addInitScript(() => window.EditContext = undefined);
	await start(page);
	await run(page, windowSetup);
	await page.locator('canvas').evaluate(canvas => canvas.addEventListener('click', () => canvas.requestFullscreen(), {once: true}));
	await page.locator('canvas').click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
	await run(page, 'SDL_ClearError(); SDL_StartTextInput();');
	expect(await run(page, 'echo json_encode(SDL_GetError());')).toMatch(/fullscreen canvas requires EditContext/);
	await run(page, poll);
	await page.keyboard.type('a');
	expect((await events(page, 'text')).map(event => event.text)).toEqual(['a']);
	await page.evaluate(() => document.exitFullscreen());
	await page.locator('canvas').focus();
	await expect.poll(() => page.evaluate(() => document.activeElement.tagName)).toBe('TEXTAREA');
	await page.keyboard.insertText('Resumed😀');
	expect((await events(page, 'text')).map(event => event.text)).toEqual(['Resumed😀']);
});

test('text input restores an existing EditContext and preserves an external replacement', async ({page}) => {
	await start(page);
	await run(page, windowSetup);
	await page.locator('canvas').evaluate(canvas => canvas.editContext = window.originalContext = new EditContext());
	await begin(page);
	expect(await page.locator('canvas').evaluate(canvas => canvas.editContext === window.originalContext)).toBe(false);
	await run(page, 'SDL_StopTextInput();');
	expect(await page.locator('canvas').evaluate(canvas => canvas.editContext === window.originalContext)).toBe(true);
	await begin(page);
	await page.locator('canvas').evaluate(canvas => canvas.editContext = window.externalContext = new EditContext());
	await run(page, 'SDL_StopTextInput();');
	expect(await page.locator('canvas').evaluate(canvas => canvas.editContext === window.externalContext)).toBe(true);
});
