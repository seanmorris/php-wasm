import {test, expect} from '@playwright/test';
import {start, run, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const extensible = ['SDL_Window', 'SDL_Cursor', 'SDL_RWops', 'SDL_Surface'
	, 'SDL_Pixels', 'SDL_Palette', 'SDL_PixelFormat', 'SDL_GLContext'];

const denial = String.raw`
function denied($object) {
	$name=get_class($object); $results=[];
	foreach([
		fn()=>serialize($object), fn()=>serialize(['native'=>$object]),
		fn()=>unserialize('O:'.strlen($name).':"'.$name.'":0:{}'),
		fn()=>unserialize('C:'.strlen($name).':"'.$name.'":0:{}'),
	] as $call) {
		try { $call(); $results[]=false; }
		catch(Exception $error) { $results[]=strpos($error->getMessage(),'not allowed')!==false; }
	}
	return $results;
}
`;

const subclasses = String.raw`
trait LegacyHooks {
	public function __sleep(): array { $GLOBALS['hooks'][]='sleep'; return []; }
	public function __wakeup(): void { $GLOBALS['hooks'][]='wakeup'; }
}
class GameWindow extends SDL_Window { use LegacyHooks; public $label='game'; }
class GameCursor extends SDL_Cursor { use LegacyHooks; }
class GameStream extends SDL_RWops { use LegacyHooks; }
class GameSurface extends SDL_Surface { use LegacyHooks; }
class GamePixels extends SDL_Pixels { use LegacyHooks; }
class GamePalette extends SDL_Palette { use LegacyHooks; }
class GameFormat extends SDL_PixelFormat { use LegacyHooks; }
class GameContext extends SDL_GLContext { use LegacyHooks; }
`;

test('ordinary SDL value objects remain serializable', async ({page}) => {
	await start(page);
	expect(await run(page, `
	$values=[new SDL_Rect(1,2,3,4),new SDL_FRect(1.5,2.5,3.5,4.5),new SDL_Point(5,6)
		,new SDL_FPoint(5.5,6.5),new SDL_Color(10,20,30,255)];
	$copies=unserialize(serialize($values)); $results=[];
	foreach($copies as $i=>$copy) {
		$results[]=get_class($copy)===get_class($values[$i]) && $copy!==$values[$i]
			&& get_object_vars($copy)===get_object_vars($values[$i]);
	}
	echo json_encode($results);
	`)).toEqual(Array(5).fill(true));
});

test('native subclasses keep working after serialization and crafted payloads are rejected', async ({page}) => {
	await start(page);
	const result = await run(page, `${denial}${subclasses}
	SDL_Init(SDL_INIT_VIDEO); $hooks=[];
	$window=new GameWindow('Subclass',0,0,32,32,SDL_WINDOW_SHOWN);
	$cursor=new GameCursor(str_repeat(chr(0),8),str_repeat(chr(255),8),8,8,0,0);
	$stream=new GameStream;
	$surface=new GameSurface(0,2,2,32,0xff,0xff00,0xff0000,-16777216);
	$pixels=new GamePixels(4,1); $pixels[0]=73;
	$palette=new GamePalette(2); $palette[0]=new SDL_Color(20,30,40,255);
	$format=new GameFormat(SDL_PIXELFORMAT_ABGR8888);
	$results=[];
	foreach([$window,$cursor,$stream,$surface,$pixels,$palette,$format] as $object) { $results[]=denied($object); }
	$renderer=SDL_CreateRenderer($window,-1,SDL_RENDERER_SOFTWARE);
	SDL_SetRenderDrawColor($renderer,255,0,0,255); SDL_RenderClear($renderer);
	$red=bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(0,0,1,1),SDL_PIXELFORMAT_ABGR8888));
	SDL_SetCursor($cursor); $same=SDL_GetCursor()===$cursor;
	SDL_FillRect($surface,null,SDL_MapRGBA($format,11,22,33,255));
	$alive=[$window->label,$window->GetTitle(),$pixels[0],$palette[0]->g,$format->BytesPerPixel,$surface->pixels[0]];
	$stream->Free(); SDL_DestroyWindow($window); SDL_FreeCursor($cursor);
	echo json_encode(compact('results','red','same','alive','hooks'));
	`);
	expect(result).toEqual({results:Array(7).fill([true,true,true,true]),red:'ff0000ff',same:true
		,alive:['game','Subclass',73,30,4,11],hooks:[]});
});

test('a GL context subclass retains real GPU resources after denied serialization', async ({page}) => {
	await start(page);
	expect(await run(page, `${denial}${subclasses}
	SDL_Init(SDL_INIT_VIDEO); $hooks=[];
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
	$window=new GameWindow('Context',0,0,32,32,SDL_WINDOW_OPENGL); $context=new GameContext($window);
	$results=denied($context); glClearColor(0,1,0,1); glClear(GL_COLOR_BUFFER_BIT);
	$green=bin2hex(glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE));
	SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('results','green','hooks'));
	`)).toEqual({results:[true,true,true,true],green:'00ff00ff',hooks:[]});
});

test('final font, audio and input objects reject both serialized formats', async ({page}) => {
	await page.addInitScript(() => {
		const pad = {id:'Standard Gamepad',index:0,connected:true,mapping:'standard',timestamp:1,axes:[0,0,0,0]
			,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
		Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
	});
	await start(page);
	expect(await run(page, `${denial}
	SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_GAMECONTROLLER); TTF_Init();
	$window=SDL_CreateWindow('Input',0,0,32,32,SDL_WINDOW_SHOWN);
	if(Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024)!==0) { throw new RuntimeException(SDL_GetError()); }
	$font=TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',16);
	$chunk=Mix_LoadWAV('/preload/sdl/click.wav'); $music=Mix_LoadMUS('/preload/sdl/loop.ogg');
	$controller=SDL_GameControllerOpen(0); $joystick=SDL_GameControllerGetJoystick($controller);
	$results=[]; foreach([$font,$chunk,$music,$controller,$joystick] as $object) { $results[]=denied($object); }
	$alive=TTF_FontHeight($font)>0 && Mix_VolumeChunk($chunk,-1)===MIX_MAX_VOLUME
		&& Mix_PlayMusic($music,0)===0 && Mix_PlayingMusic()===1
		&& SDL_GameControllerGetAttached($controller) && SDL_JoystickGetAttached($joystick);
	TTF_Quit(); Mix_CloseAudio(); SDL_Quit(); echo json_encode(compact('results','alive'));
	`)).toEqual({results:Array(5).fill([true,true,true,true]),alive:true});
});

test('serialization guards cover every extensible native class and direct legacy calls', async ({page}) => {
	await start(page);
	const result = await run(page, `
	$classes=${JSON.stringify(extensible)}; $results=[];
	foreach($classes as $name) {
		$reflection=new ReflectionClass($name); $guarded=$reflection->isInternal() && !$reflection->isFinal();
		if(PHP_VERSION_ID<80100) {
			foreach(['__serialize'=>'array','__unserialize'=>'void'] as $methodName=>$type) {
				$method=$reflection->getMethod($methodName);
				$guarded=$guarded && $method->isPublic() && $method->isFinal() && $method->isInternal()
					&& !$method->isStatic() && $method->getReturnType()->getName()===$type;
				if($methodName==='__unserialize') {
					$guarded=$guarded && $method->getNumberOfRequiredParameters()===1
						&& $method->getParameters()[0]->getType()->getName()==='array';
				}
			}
		}
		$results[]=$guarded;
	}
	class BlankPixels extends SDL_Pixels { public function __construct() {} }
	$object=new BlankPixels; $calls=[];
	if(PHP_VERSION_ID<80100) {
		foreach([fn()=>$object->__serialize(),fn()=>$object->__unserialize([])] as $call) {
			try { $call(); $calls[]=false; }
			catch(Exception $error) { $calls[]=strpos($error->getMessage(),'not allowed')!==false; }
		}
	} else {
		foreach([fn()=>serialize($object),fn()=>unserialize('O:11:"BlankPixels":0:{}')] as $call) {
			try { $call(); $calls[]=false; }
			catch(Exception $error) { $calls[]=strpos($error->getMessage(),'not allowed')!==false; }
		}
	}
	echo json_encode(compact('results','calls'));
	`);
	expect(result).toEqual({results:Array(8).fill(true),calls:[true,true]});
});

test('subclass magic methods cannot bypass native serialization denial', async ({page}) => {
	await start(page);
	const legacy = await run(page, 'echo json_encode(PHP_VERSION_ID<80100);');
	for(const name of extensible)
	{
		for(const method of ['__serialize', '__unserialize'])
		{
			const definition = method === '__serialize'
				? 'public function __serialize(): array { $GLOBALS["called"]=true; return []; }'
				: 'public function __unserialize(array $data): void { $GLOBALS["called"]=true; }';
			const result = await page.evaluate(async ({name, method, definition}) => {
				await window.bindingPhp.refresh();
				window.bindingOutput = window.bindingErrors = '';
				const status = await window.bindingPhp.run(`<?php
				class MagicNative extends ${name} { public function __construct() {} ${definition} }
				$called=false; $denied=false;
				try {
					if('${method}'==='__serialize') { serialize(new MagicNative); }
					else { unserialize('O:11:"MagicNative":0:{}'); }
				} catch(Exception $error) { $denied=strpos($error->getMessage(),'not allowed')!==false; }
				echo json_encode(compact('called','denied'));
				`);
				return {status,output:window.bindingOutput,errors:window.bindingErrors};
			}, {name, method, definition});
			if(legacy)
			{
				expect(result.status, `${name}::${method}`).not.toBe(0);
				expect(result.errors).toContain(`Cannot override final method ${name}::${method}()`);
				expect(result.output).toBe('');
			}
			else
			{
				expect(result).toEqual({status:0,output:'{"called":false,"denied":true}',errors:''});
			}
		}
	}
});

test('crafted native payload churn releases temporary wrappers', async ({page}) => {
	await start(page);
	const batch = `
	$rejected=0;
	for($i=0;$i<50;$i++) { foreach(denied($pixel) as $ok) { $rejected+=(int)$ok; } }
	gc_collect_cycles(); echo json_encode([$rejected,$pixel[0]]);
	`;
	await run(page, `${denial}
	class PlainPixels extends SDL_Pixels {}
	$pixel=new PlainPixels(4,1); $pixel[0]=91;
	`);
	// Warm the same PHP globals and execution path before checking live bytes.
	expect(await run(page, batch)).toEqual([200,91]);
	const baseline = await allocationStats(page);
	const samples = [baseline];
	for(let iteration = 0; iteration < 3; iteration++)
	{
		expect(await run(page, batch)).toEqual([200,91]);
		const sample = await allocationStats(page);
		samples.push(sample);
		expect(sample.sdlAllocations).toBe(baseline.sdlAllocations);
		expect(sample.liveBytes).toBeLessThanOrEqual(baseline.liveBytes);
	}
	await test.info().attach('native-allocator', {body:JSON.stringify(samples),contentType:'application/json'});
	await run(page, 'unset($pixel); gc_collect_cycles(); SDL_Quit();');
	expect((await allocationStats(page)).sdlAllocations).toBe(0);
});

test('Serializable implementations cannot replace the native denial handler', async ({page}) => {
	await start(page);
	const legacy = await run(page, 'echo json_encode(PHP_VERSION_ID<80100);');
	for(const name of extensible)
	{
		const result = await page.evaluate(async ({name, legacy, denial}) => {
			await window.bindingPhp.refresh();
			window.bindingOutput = window.bindingErrors = '';
			// PHP 8.0 rejects implementing Serializable on a native class with
			// legacy handlers. Newer PHP flags deny every format before hooks.
			const magic = legacy ? '' : `
				public function __serialize(): array { $GLOBALS['called']=true; return []; }
				public function __unserialize(array $data): void { $GLOBALS['called']=true; }
			`;
			const status = await window.bindingPhp.run(`<?php
			class CustomNative extends ${name} implements Serializable {
				public function __construct() {}
				public function serialize(): ?string { $GLOBALS['called']=true; return ''; }
				public function unserialize($data): void { $GLOBALS['called']=true; }
				${magic}
			}
			$called=false; ${denial}
			$results=denied(new CustomNative); echo json_encode(compact('results','called'));
			`);
			return {status,output:window.bindingOutput,errors:window.bindingErrors};
		}, {name, legacy, denial});
		if(legacy)
		{
			expect(result.status, name).not.toBe(0);
			expect(result.errors).toContain('Class CustomNative could not implement interface Serializable');
			expect(result.output).toBe('');
		}
		else
		{
			expect(result).toEqual({status:0,output:'{"results":[true,true,true,true],"called":false}',errors:''});
		}
	}
});
