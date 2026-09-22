import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, windowSetup} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'Requires the SDL runtime artifact');

test.afterEach(async ({page}) => {
	await page.evaluate(async () => {
		if(window.bindingPhp) { await window.bindingPhp.refresh(); }
	});
});

test('SDL events retain mouse, keyboard, UTF-8, touch and controller payloads', async ({page}) => {
	await start(page);
	const data = await run(page, String.raw`${windowSetup}${rejectHelper}
	$event = new SDL_Event;
	while(SDL_PollEvent($event)) {}
	$cases = [
		[SDL_MOUSEBUTTONUP, 'button', ['button'=>1, 'state'=>0, 'clicks'=>2, 'x'=>12, 'y'=>34]],
		[SDL_MOUSEWHEEL, 'wheel', ['x'=>-2, 'y'=>3, 'preciseX'=>-2.5, 'preciseY'=>3.25, 'direction'=>SDL_MOUSEWHEEL_FLIPPED, 'mouseX'=>19, 'mouseY'=>20]],
		[SDL_MOUSEMOTION, 'motion', ['x'=>12, 'y'=>34, 'xrel'=>-2, 'yrel'=>4, 'state'=>1]],
		[SDL_KEYUP, 'key', ['state'=>0, 'repeat'=>1, 'keysym'=>(object)['sym'=>SDLK_a, 'scancode'=>SDL_SCANCODE_A, 'mod'=>KMOD_SHIFT]]],
		[SDL_TEXTINPUT, 'text', ['text'=>'ë · 日本語']],
		[SDL_TEXTEDITING, 'edit', ['text'=>'é', 'start'=>1, 'length'=>2]],
		[SDL_FINGERDOWN, 'tfinger', ['touchId'=>'9223372036854775807', 'fingerId'=>'-9223372036854775808', 'x'=>.25, 'y'=>.5, 'dx'=>.125, 'dy'=>-.25, 'pressure'=>.75]],
		[SDL_JOYHATMOTION, 'jhat', ['which'=>42, 'hat'=>0, 'value'=>SDL_HAT_RIGHTUP]],
		[SDL_JOYDEVICEADDED, 'jdevice', ['which'=>99]],
		[SDL_CONTROLLERAXISMOTION, 'caxis', ['which'=>42, 'axis'=>SDL_CONTROLLER_AXIS_LEFTX, 'value'=>-16000]],
		[SDL_CONTROLLERBUTTONUP, 'cbutton', ['which'=>42, 'button'=>SDL_CONTROLLER_BUTTON_A, 'state'=>0]],
		[SDL_CONTROLLERDEVICEREMOVED, 'cdevice', ['which'=>42]]
	];
	$results = [];
	foreach($cases as [$type, $member, $fields]) {
		$input = new SDL_Event;
		$input->type = $type;
		$input->$member = (object)$fields;
		if(SDL_PushEvent($input) !== 1) { throw new RuntimeException(SDL_GetError()); }
		while(SDL_PollEvent($event)) {
			if($event->type !== $type) { continue; }
			$results[$member . ':' . $type] = $event->$member;
		}
	}
	$last = $event;
	$empty = SDL_PollEvent($event) === 0 && $last === $event;
	$input = new SDL_Event; $input->type = SDL_TEXTINPUT; $input->text = (object)['text'=>str_repeat('x', 32)];
	$reject('text-overflow', function() use ($input) { SDL_PushEvent($input); });
	$input->type = SDL_MOUSEBUTTONUP; $input->button = (object)['button'=>256];
	$reject('byte-overflow', function() use ($input) { SDL_PushEvent($input); });
	echo json_encode(['events'=>array_values($results), 'empty'=>$empty, 'rejected'=>$rejected]);
	`);
	expect(data.events).toHaveLength(12);
	expect(data.events[0]).toMatchObject({button: 1, state: 0, clicks: 2, x: 12, y: 34});
	expect(data.events[1]).toMatchObject({x: -2, y: 3, preciseX: -2.5, preciseY: 3.25, direction: 1, mouseX: 19, mouseY: 20});
	expect(data.events[2]).toMatchObject({xrel: -2, yrel: 4, state: 1});
	expect(data.events[3]).toMatchObject({state: 0, repeat: 1, keysym: {sym: 97, scancode: 4, mod: 3}});
	expect(data.events[4].text).toBe('ë · 日本語');
	expect(data.events[5]).toMatchObject({text: 'é', start: 1, length: 2});
	expect(data.events[6]).toMatchObject({touchId: '9223372036854775807', fingerId: '-9223372036854775808', x: .25, pressure: .75});
	expect(data.events[7]).toMatchObject({which: 42, hat: 0, value: 3});
	expect(data.events[8].which).toBe(99);
	expect(data.events[9]).toMatchObject({which: 42, axis: 0, value: -16000});
	expect(data.events[10]).toMatchObject({which: 42, button: 0, state: 0});
	expect(data.events[11].which).toBe(42);
	expect(data.empty).toBe(true);
	expect(data.rejected).toEqual(['text-overflow', 'byte-overflow']);
	// Exercise Emscripten's real browser event path as well as native queue roundtrips.
	await page.locator('canvas').focus();
	await page.keyboard.press('a');
	const keys = await run(page, String.raw`
	$keys = [];
	while(SDL_PollEvent($event)) {
		if($event->type === SDL_KEYDOWN || $event->type === SDL_KEYUP) { $keys[] = $event->key; }
	}
	echo json_encode($keys);
	SDL_DestroyWindow($window); SDL_Quit();
	`);
	expect(keys).toEqual(expect.arrayContaining([
		expect.objectContaining({state: 1, repeat: 0, keysym: expect.objectContaining({sym: 97, scancode: 4})})
		, expect.objectContaining({state: 0, keysym: expect.objectContaining({sym: 97})})
	]));
});

test('SDL streaming textures upload, lock, modulate and invalidate aliases safely', async ({page}) => {
	await start(page);
	const data = await run(page, String.raw`${windowSetup}${rejectHelper}
	$renderer = SDL_CreateRenderer($window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_TARGETTEXTURE);
	if(!$renderer) { throw new RuntimeException(SDL_GetError()); }
	$texture = SDL_CreateTexture($renderer, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STREAMING, 2, 2);
	SDL_SetTextureBlendMode($texture, SDL_BLENDMODE_NONE);
	SDL_UpdateTexture($texture, null, str_repeat("\x11\x22\x33\xff", 4), 8);
	SDL_RenderCopy($renderer, $texture, null, new SDL_Rect(0, 0, 2, 2));
	$uploaded = bin2hex(SDL_RenderReadPixels($renderer, new SDL_Rect(0,0,2,2), SDL_PIXELFORMAT_ABGR8888));
	SDL_LockTexture($texture, new SDL_Rect(1, 0, 1, 2), $pixels, $pitch);
	for($row=0; $row<2; $row++) {
		foreach([64,128,192,255] as $byte=>$value) { $pixels[$row*$pitch+$byte] = $value; }
	}
	$reject('double-lock', function() use ($texture) { SDL_LockTexture($texture, null, $again, $pitch); });
	SDL_UnlockTexture($texture);
	SDL_SetTextureColorMod($texture, 128, 128, 128);
	SDL_SetTextureAlphaMod($texture, 96);
	SDL_SetTextureScaleMode($texture, SDL_ScaleModeNearest);
	SDL_GetTextureColorMod($texture, $red, $green, $blue);
	SDL_GetTextureAlphaMod($texture, $alpha);
	SDL_GetTextureScaleMode($texture, $scale);
	SDL_GetTextureBlendMode($texture, $blend);
	SDL_RenderCopy($renderer, $texture, null, new SDL_Rect(0,0,2,2));
	$locked = bin2hex(SDL_RenderReadPixels($renderer, new SDL_Rect(1,0,1,1), SDL_PIXELFORMAT_ABGR8888));
	$reject('short-buffer', function() use ($texture) { SDL_UpdateTexture($texture, null, 'x', 8); });
	$reject('short-pitch', function() use ($texture) { SDL_UpdateTexture($texture, null, str_repeat('x',16), 1); });
	$reject('outside-rect', function() use ($texture) { SDL_LockTexture($texture, new SDL_Rect(2,0,1,1), $buffer, $pitch); });
	$reject('color-overflow', function() use ($texture) { SDL_SetTextureColorMod($texture,256,0,0); });
	$holder = new class { public int $pixels = 0; };
	$reject('buffer-type', function() use ($texture, $holder) { SDL_LockTexture($texture,null,$holder->pixels,$pitch); });
	if(SDL_LockTexture($texture,null,$next,$nextPitch) !== 0) { throw new RuntimeException('failed output assignment left texture locked'); }
	SDL_UnlockTexture($texture);
	$target = SDL_CreateTexture($renderer, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_TARGET, 4, 4);
	$targets = [SDL_SetRenderTarget($renderer, $target), SDL_SetRenderTarget($renderer, null)];
	$source = SDL_CreateRGBSurface(0,2,2,32,0xff,0xff00,0xff0000,-16777216);
	$destination = SDL_CreateRGBSurface(0,4,4,32,0xff,0xff00,0xff0000,-16777216);
	SDL_FillRect($source,new SDL_Rect(0,0,2,2),SDL_MapRGBA($source->format,255,0,0,255));
	SDL_FillRect($destination,new SDL_Rect(0,0,4,4),SDL_MapRGBA($destination->format,0,0,255,255));
	$offset = new SDL_Rect(1,1,4,4); $offsetAlias = $offset;
	SDL_UpperBlit($source,null,$destination,$offset);
	$blitTexture = SDL_CreateTextureFromSurface($renderer,$destination);
	SDL_RenderCopy($renderer,$blitTexture,null,new SDL_Rect(0,0,4,4));
	$blitColors = [
		bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(0,0,1,1),SDL_PIXELFORMAT_ABGR8888)),
		bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(1,1,1,1),SDL_PIXELFORMAT_ABGR8888))
	];
	$blitRect = [$offset === $offsetAlias,$offset->x,$offset->y,$offset->w,$offset->h];
	$borrowed = $destination->pixels;
	SDL_FreeSurface($source); SDL_FreeSurface($destination);
	$reject('borrowed-pixels', function() use ($texture,$borrowed) { SDL_UpdateTexture($texture,null,$borrowed,16); });
	$ownedUpload = SDL_UpdateTexture($texture,null,new SDL_Pixels(8,2),8);
	SDL_DestroyTexture($blitTexture);
	$alias = $texture;
	SDL_DestroyTexture($texture);
	$reject('destroyed-alias', function() use ($alias) { SDL_SetTextureAlphaMod($alias,1); });
	$reject('invalid-object', function() { SDL_RenderClear(new stdClass); });
	$fromImage = IMG_LoadTexture($renderer, '/preload/sdl/sean-icon-32.png');
	SDL_DestroyRenderer($renderer);
	$reject('renderer-child', function() use ($target) { SDL_SetTextureAlphaMod($target,1); });
	$reject('image-child', function() use ($fromImage) { SDL_SetTextureAlphaMod($fromImage,1); });
	$renderer = SDL_CreateRenderer($window, -1, SDL_RENDERER_ACCELERATED);
	$texture = SDL_CreateTexture($renderer, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STREAMING, 1, 1);
	SDL_LockTexture($texture, null, $retained, $ignored);
	SDL_DestroyWindow($window);
	$reject('window-child', function() use ($texture) { SDL_UnlockTexture($texture); });
	$retained[0] = 123; // PHP-owned memory is still valid after destruction.
	SDL_Quit();
	SDL_Init(SDL_INIT_VIDEO); SDL_InitSubSystem(SDL_INIT_VIDEO);
	$window = SDL_CreateWindow('Lifetime',0,0,16,16,SDL_WINDOW_SHOWN);
	$renderer = SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED);
	SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$stillLive = SDL_RenderClear($renderer) === 0;
	SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$reject('subsystem-child', function() use ($renderer) { SDL_RenderClear($renderer); });
	SDL_Quit();
	echo json_encode(compact('ownedUpload','blitColors','blitRect','stillLive','uploaded','locked','red','green','blue','alpha','scale','blend','targets','rejected') + ['retained'=>$retained[0], 'pixels'=>$pixels[0]]);
	`);
	expect(data.uploaded).toBe('112233ff'.repeat(4));
	expect(data.locked.slice(0, 6)).toBe('204060');
	expect([data.red, data.green, data.blue, data.alpha, data.scale, data.blend]).toEqual([128, 128, 128, 96, 0, 0]);
	expect(data.targets).toEqual([0, 0]);
	expect(data.blitColors).toEqual(['0000ffff', 'ff0000ff']);
	expect(data.blitRect).toEqual([true, 1, 1, 2, 2]);
	expect(data.ownedUpload).toBe(0);
	expect(data.retained).toBe(123);
	expect(data.stillLive).toBe(true);
	expect(data.pixels).toBe(64);
	expect(data.rejected).toEqual(['double-lock', 'short-buffer', 'short-pitch', 'outside-rect', 'color-overflow', 'buffer-type', 'borrowed-pixels', 'destroyed-alias', 'invalid-object', 'renderer-child', 'image-child', 'window-child', 'subsystem-child']);
});

test('SDL_ttf measures UTF-8 and provides native bold, outline, wrapping and glyph metrics', async ({page}) => {
	await start(page);
	const data = await run(page, String.raw`${rejectHelper}
	TTF_Init();
	$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf', 24);
	TTF_SizeUTF8($font, 'é', $width, $height);
	TTF_SizeUTF8($font, 'e', $ascii, $ignored);
	TTF_SizeText($font, 'é', $latin, $ignored);
	$metrics = TTF_GlyphMetrics32($font, 235, $minX, $maxX, $minY, $maxY, $advance);
	$provided = TTF_GlyphIsProvided32($font, 235);
	$baseline = [TTF_FontHeight($font), TTF_FontAscent($font), TTF_FontDescent($font), TTF_FontLineSkip($font)];
	$white = new SDL_Color(255,255,255,255); $black = new SDL_Color(0,0,0,255);
	$plain = TTF_RenderUTF8_Blended($font, 'Kenët · 日本語', $white);
	$plainSize = [$plain->w, $plain->h]; SDL_FreeSurface($plain);
	TTF_SetFontStyle($font, TTF_STYLE_BOLD | TTF_STYLE_ITALIC);
	TTF_SetFontOutline($font, 2);
	TTF_SetFontHinting($font, TTF_HINTING_LIGHT);
	TTF_SetFontKerning($font, 0);
	$style = [TTF_GetFontStyle($font), TTF_GetFontOutline($font), TTF_GetFontHinting($font), TTF_GetFontKerning($font)];
	$bold = TTF_RenderUTF8_Blended($font, 'Kenët · 日本語', $white);
	$boldSize = [$bold->w, $bold->h]; SDL_FreeSurface($bold);
	$wrapped = TTF_RenderUTF8_Blended_Wrapped($font, 'Hello world hello world', $white, 120);
	$wrappedSize = [$wrapped->w, $wrapped->h]; SDL_FreeSurface($wrapped);
	$renders = [];
	foreach(['Solid','Blended','Shaded'] as $mode) {
		$args = [$font, 'ë ·', $white]; if($mode === 'Shaded') { $args[] = $black; }
		$surface = ('TTF_RenderUTF8_' . $mode)(...$args);
		$renders[] = $surface->w > 0; SDL_FreeSurface($surface);
		$args[] = 100;
		foreach(['Text','UTF8'] as $encoding) {
			$surface = ('TTF_Render' . $encoding . '_' . $mode . '_Wrapped')(...$args);
			$renders[] = $surface->w > 0; SDL_FreeSurface($surface);
		}
	}
	$reject('negative-wrap', function() use ($font,$white) { TTF_RenderUTF8_Blended_Wrapped($font,'x',$white,-1); });
	$reject('surrogate', function() use ($font) { TTF_GlyphIsProvided32($font,0xd800); });
	$reject('nul', function() use ($font) { TTF_SizeUTF8($font,"a\0b",$w,$h); });
	$reject('style', function() use ($font) { TTF_SetFontStyle($font,16); });
	TTF_CloseFont($font);
	$reject('closed-font', function() use ($font) { TTF_FontHeight($font); });
	TTF_Quit();
	echo json_encode(compact('width','height','ascii','latin','metrics','provided','advance','baseline','plainSize','boldSize','wrappedSize','style','renders','rejected'));
	`);
	expect(data.width).toBe(data.ascii);
	expect(data.latin).toBeGreaterThan(data.ascii * 1.5);
	expect(data.metrics).toBe(0);
	expect(data.provided).toBeGreaterThan(0);
	expect(data.advance).toBe(data.ascii);
	expect(data.baseline[0]).toBeGreaterThan(0);
	expect(data.baseline[1]).toBeGreaterThan(0);
	expect(data.baseline[2]).toBeLessThan(0);
	expect(data.boldSize[0]).toBeGreaterThan(data.plainSize[0]);
	expect(data.boldSize[1]).toBe(data.plainSize[1] + 4);
	expect(data.wrappedSize[1]).toBeGreaterThan(data.boldSize[1]);
	expect(data.style).toEqual([3, 2, 1, 0]);
	expect(data.renders).toEqual(Array(9).fill(true));
	expect(data.rejected).toEqual(['negative-wrap', 'surrogate', 'nul', 'style', 'closed-font']);
});

test('SDL counters retain unsigned precision and measure elapsed time', async ({page}) => {
	await page.addInitScript(() => {
		const now = performance.now.bind(performance);
		Object.defineProperty(performance, 'now', {value: () => now() + 10000});
	});
	await start(page);
	const before = await run(page, String.raw`SDL_Init(SDL_INIT_TIMER); echo json_encode([SDL_GetTicks(), SDL_GetTicks64(), SDL_GetPerformanceCounter(), SDL_GetPerformanceFrequency(), PHP_INT_MAX]);`);
	await page.waitForTimeout(30);
	const after = await run(page, String.raw`echo json_encode([SDL_GetTicks(), SDL_GetTicks64(), SDL_GetPerformanceCounter(), SDL_GetPerformanceFrequency()]); SDL_Quit();`);
	for(const sample of [before, after])
	{
		for(const value of sample.slice(0, 4)) { expect(String(value)).toMatch(/^\d+$/); }
		if(BigInt(sample[2]) > BigInt(before[4])) { expect(typeof sample[2]).toBe('string'); }
	}
	expect(Number(after[0]) - Number(before[0])).toBeGreaterThanOrEqual(25);
	expect(BigInt(after[1])).toBeGreaterThan(BigInt(before[1]));
	expect(BigInt(after[2])).toBeGreaterThan(BigInt(before[2]));
	expect(after[3]).toBe(before[3]);
	expect(Number(after[3])).toBeGreaterThan(0);
	expect(BigInt(before[2])).toBeGreaterThan(BigInt(before[4]));
	expect(typeof before[2]).toBe('string');
});

test('SDL standard controllers poll browser gamepads and survive close and disconnect', async ({page}) => {
	await page.addInitScript(() => {
		window.testPad = {
			id: 'Standard Gamepad', index: 0, connected: true, mapping: 'standard', timestamp: 1
			, axes: [0, 0, 0, 0]
			, buttons: Array.from({length: 17}, () => ({pressed: false, touched: false, value: 0}))
		};
		Object.defineProperty(navigator, 'getGamepads', {value: () => window.testPad.connected ? [window.testPad] : []});
	});
	await start(page);
	const initial = await run(page, String.raw`${windowSetup}${rejectHelper}
	$controller = SDL_GameControllerOpen(0);
	if(!$controller) { throw new RuntimeException(SDL_GetError()); }
	$joystick = SDL_GameControllerGetJoystick($controller);
	$independent = SDL_JoystickOpen(0);
	$id = SDL_JoystickInstanceID($joystick);
	echo json_encode([
		SDL_NumJoysticks(), SDL_IsGameController(0), SDL_GameControllerGetAttached($controller),
		SDL_JoystickGetAttached($joystick), SDL_JoystickNumAxes($joystick), SDL_JoystickNumButtons($joystick),
		$id === SDL_JoystickGetDeviceInstanceID(0), SDL_GameControllerMapping($controller) !== null
	]);
	`);
	expect(initial.slice(0, 4)).toEqual([1, true, true, true]);
	expect(initial[4]).toBeGreaterThanOrEqual(4);
	expect(initial[5]).toBeGreaterThanOrEqual(17);
	expect(initial.slice(6)).toEqual([true, true]);
	await page.locator('canvas').focus();
	await page.evaluate(() => {
		window.testPad.axes[0] = .5;
		window.testPad.buttons[0] = {pressed: true, touched: true, value: 1};
		window.testPad.timestamp++;
	});
	const pressed = await run(page, String.raw`
	SDL_GameControllerUpdate(); SDL_JoystickUpdate();
	$event = new SDL_Event; $buttons = [];
	while(SDL_PollEvent($event)) {
		if($event->type === SDL_CONTROLLERBUTTONDOWN) { $buttons[] = $event->cbutton; }
	}
	echo json_encode([
		SDL_GameControllerGetAxis($controller, SDL_CONTROLLER_AXIS_LEFTX),
		SDL_GameControllerGetButton($controller, SDL_CONTROLLER_BUTTON_A),
		SDL_JoystickGetButton($joystick, 0), $buttons
	]);
	`);
	expect(pressed[0]).toBeGreaterThanOrEqual(16383);
	expect(pressed[0]).toBeLessThanOrEqual(16384);
	expect(pressed.slice(1, 3)).toEqual([1, 1]);
	expect(pressed[3]).toEqual(expect.arrayContaining([expect.objectContaining({button: 0, state: 1})]));
	const closed = await run(page, String.raw`
	$reject('axis-range', function() use ($controller) { SDL_GameControllerGetAxis($controller, SDL_CONTROLLER_AXIS_MAX); });
	SDL_GameControllerClose($controller); SDL_GameControllerClose($controller);
	$reject('closed-controller', function() use ($controller) { SDL_GameControllerGetButton($controller,0); });
	$stillOpen = SDL_JoystickGetAttached($joystick) && SDL_JoystickGetButton($independent,0) === 1;
	SDL_JoystickClose($joystick); SDL_JoystickClose($joystick);
	$reject('closed-joystick', function() use ($joystick) { SDL_JoystickGetAxis($joystick,0); });
	echo json_encode(['stillOpen'=>$stillOpen,'rejected'=>$rejected]);
	`);
	expect(closed).toEqual({stillOpen: true, rejected: ['axis-range', 'closed-controller', 'closed-joystick']});
	await page.evaluate(() => {
		window.testPad.connected = false;
		window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), {gamepad: window.testPad}));
	});
	const detached = await run(page, String.raw`
	SDL_JoystickUpdate();
	$attached = SDL_JoystickGetAttached($independent);
	SDL_Quit();
	$reject('quit-joystick', function() use ($independent) { SDL_JoystickGetButton($independent,0); });
	echo json_encode(['attached'=>$attached, 'rejected'=>end($rejected)]);
	`);
	expect(detached).toEqual({attached: false, rejected: 'quit-joystick'});
});

test('OpenGL scalar, vector-array and matrix uniforms reach the real WebGL program', async ({page}) => {
	await start(page);
	const uniforms = [];
	for(const kind of ['f', 'i'])
	{
		for(let size = 1; size <= 4; size++)
		{
			const type = size === 1 ? (kind === 'f' ? 'float' : 'int') : `${kind === 'i' ? 'i' : ''}vec${size}`;
			uniforms.push({name: `u_${kind}${size}`, type, size, kind, count: 2});
		}
	}
	for(const [dimensions, size] of [['2',4], ['3',9], ['4',16], ['2x3',6], ['3x2',6], ['2x4',8], ['4x2',8], ['3x4',12], ['4x3',12]])
	{
		uniforms.push({name: `u_m${dimensions}`, type: `mat${dimensions}`, size, kind: 'matrix', dimensions, count: 1});
	}
	const declarations = uniforms.map(({type, name, count}) => `uniform ${type} ${name}${count > 1 ? '[2]' : ''};`).join('\n');
	const terms = uniforms.flatMap(({name, size, kind, count}) => Array.from({length: count}, (_, index) => {
		const element = `${name}${count > 1 ? `[${index}]` : ''}`;
		return kind === 'matrix' ? `${element}[0][0]` : `float(${element}${size > 1 ? '.x' : ''})`;
	}));
	const vertex = `#version 300 es\n${declarations}\nvoid main(){gl_Position=vec4((${terms.join('+')})*.0001,0.0,0.0,1.0);gl_PointSize=1.0;}`;
	const fragment = '#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1.0);}';
	const setters = uniforms.map(({name, size, kind, dimensions, count}) => {
		const values = Array.from({length: size * count}, (_, index) => index + 1);
		return `$location=glGetUniformLocation($program,'${name}'); glUniform${kind === 'matrix' ? `Matrix${dimensions}fv($location,1,false` : `${size}${kind}v($location,2`},[${values}]);`;
	}).join('\n');
	await run(page, String.raw`
	SDL_Init(SDL_INIT_VIDEO);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
	$window = SDL_CreateWindow('Uniforms',0,0,64,64,SDL_WINDOW_OPENGL);
	$context = SDL_GL_CreateContext($window);
	SDL_GL_MakeCurrent($window,$context);
	$program = glCreateProgram();
	foreach([[GL_VERTEX_SHADER,${JSON.stringify(vertex)}],[GL_FRAGMENT_SHADER,${JSON.stringify(fragment)}]] as [$type,$source]) {
		$shader=glCreateShader($type); glShaderSource($shader,1,$source); glCompileShader($shader);
		if(!glGetShaderiv($shader,GL_COMPILE_STATUS)) { throw new RuntimeException(glGetShaderInfoLog($shader)); }
		glAttachShader($program,$shader); glDeleteShader($shader);
	}
	glLinkProgram($program); glUseProgram($program);
	if(!glGetProgramiv($program,GL_LINK_STATUS)) { throw new RuntimeException(glGetProgramInfoLog($program)); }
	${setters}
	if(glGetError()) { throw new RuntimeException('uniform upload failed'); }
	`);
	const values = await page.evaluate(uniforms => {
		const gl = document.querySelector('canvas').getContext('webgl2');
		const program = gl.getParameter(gl.CURRENT_PROGRAM);
		return uniforms.map(({name, count}) => Array.from({length: count}, (_, index) => {
			const result = gl.getUniform(program, gl.getUniformLocation(program, `${name}${count > 1 ? `[${index}]` : ''}`));
			return ArrayBuffer.isView(result) ? [...result] : [result];
		}).flat());
	}, uniforms);
	for(const [index, {size, count}] of uniforms.entries())
	{
		expect(values[index]).toEqual(Array.from({length: size * count}, (_, index) => index + 1));
	}
	const scalarSetters = uniforms.filter(({kind}) => kind !== 'matrix').map(({name, size, kind}) =>
		`glUniform${size}${kind}(glGetUniformLocation($program,'${name}[0]'),${Array(size).fill(kind === 'f' ? '0.5' : '7')});`
	).join('\n');
	const result = await run(page, String.raw`${rejectHelper}
	${scalarSetters}
	$reject('vector-size',function(){glUniform3fv(0,1,[1,2]);});
	$reject('int-type',function(){glUniform2iv(0,1,[1,2.5]);});
	$reject('matrix-size',function(){glUniformMatrix2x3fv(0,1,false,[1]);});
	$reject('transpose',function(){glUniformMatrix3fv(0,1,true,array_fill(0,9,1));});
	$reject('nan',function(){glUniform2f(0,NAN,0);});
	$reject('float-overflow',function(){glUniform2fv(0,1,[1e100,0]);});
	$reject('negative-count',function(){glUniform1iv(0,-1,[]);});
	echo json_encode(['error'=>glGetError(), 'rejected'=>$rejected]);
	`);
	expect(result).toEqual({error: 0, rejected: ['vector-size', 'int-type', 'matrix-size', 'transpose', 'nan', 'float-overflow', 'negative-count']});
	const scalars = await page.evaluate(uniforms => {
		const gl = document.querySelector('canvas').getContext('webgl2');
		const program = gl.getParameter(gl.CURRENT_PROGRAM);
		return uniforms.filter(({kind}) => kind !== 'matrix').map(({name}) => {
			const value = gl.getUniform(program, gl.getUniformLocation(program, `${name}[0]`));
			return ArrayBuffer.isView(value) ? [...value] : [value];
		});
	}, uniforms);
	for(const [index, {kind, size}] of uniforms.filter(({kind}) => kind !== 'matrix').entries())
	{
		expect(scalars[index]).toEqual(Array(size).fill(kind === 'f' ? .5 : 7));
	}
	await run(page, `glDeleteProgram($program); SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();`);
});
