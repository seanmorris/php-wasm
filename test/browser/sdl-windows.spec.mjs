import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const setup = `
if(SDL_Init(SDL_INIT_VIDEO) !== 0) { throw new RuntimeException(SDL_GetError()); }
$window = new SDL_Window('Original',0,0,32,32,SDL_WINDOW_SHOWN);
`;

test('window aliases retain their native owner and subclass properties', async ({page}) => {
	await start(page);
	const result = await run(page, `${rejectHelper}
	SDL_Init(SDL_INIT_VIDEO);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
	class GameWindow extends SDL_Window { public $label='game'; }
	$window=new GameWindow('Alias',0,0,32,32,SDL_WINDOW_OPENGL);
	$context=new SDL_GLContext($window); $id=SDL_GetWindowID($window);
	$alias=SDL_GL_GetCurrentWindow(); $same=$alias===$window && $alias->label==='game';
	$ref=WeakReference::create($window); unset($window); gc_collect_cycles();
	$retained=$ref->get()===$alias && $alias->GetID()===$id;
	SDL_DestroyWindow($alias); SDL_DestroyWindow($alias);
	$reject('closed-window',fn()=>$alias->GetTitle());
	$reject('closed-context',fn()=>SDL_GL_MakeCurrent($alias,$context));
	unset($alias); gc_collect_cycles(); $collected=$ref->get()===null;
	SDL_Quit(); echo json_encode(compact('same','retained','collected','rejected','id'));
	`);
	expect(result).toMatchObject({same:true, retained:true, collected:true, rejected:['closed-window','closed-context']});
	expect(await page.evaluate(async id => (await window.bindingPhp.binary)._SDL_GetWindowFromID(id), result.id)).toBe(0);
});

test('window subclasses work with the SDL software renderer', async ({page}) => {
	await start(page);
	expect(await run(page, `
	SDL_Init(SDL_INIT_VIDEO); class GameWindow extends SDL_Window {}
	$window=new GameWindow('Renderer',0,0,32,32,SDL_WINDOW_SHOWN);
	$renderer=SDL_CreateRenderer($window,-1,SDL_RENDERER_SOFTWARE);
	SDL_SetRenderDrawColor($renderer,255,0,0,255); SDL_RenderClear($renderer);
	$pixel=bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(0,0,1,1),SDL_PIXELFORMAT_ABGR8888));
	SDL_DestroyWindow($window); SDL_Quit(); echo json_encode($pixel);
	`)).toBe('ff0000ff');
});

test('window construction and copying cannot duplicate or overwrite native ownership', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	$id=SDL_GetWindowID($window);
	$reject('clone',fn()=>clone $window); $reject('serialize',fn()=>serialize($window));
	$reject('unserialize',fn()=>unserialize('O:10:"SDL_Window":0:{}'));
	$reject('repeat',fn()=>$window->__construct('Overwrite',0,0,32,32,SDL_WINDOW_SHOWN));
	$reject('title-nul',fn()=>SDL_SetWindowTitle($window,"bad\\0title"));
	$reject('create-nul',fn()=>SDL_CreateWindow("bad\\0title",0,0,32,32,0));
	$unchanged=SDL_GetWindowID($window)===$id && $window->GetTitle()==='Original';
	$small=SDL_CreateWindow('Clamped',0,0,-1,0,0); $small->GetSize($width,$height);
	$clamped=[$width,$height]; $small->Destroy();
	// Pinned SDL_WINDOW_VULKAN cannot be combined with SDL_WINDOW_OPENGL.
	$conflict=SDL_WINDOW_OPENGL | 0x10000000;
	$failed=SDL_CreateWindow('Bad flags',0,0,32,32,$conflict)===null && SDL_GetError()!=='';
	$reject('failed-constructor',fn()=>new SDL_Window('Bad flags',0,0,32,32,$conflict));
	$window->Destroy(); $window->Destroy();
	echo json_encode(compact('unchanged','failed','clamped','rejected'));
	`)).toEqual({unchanged:true, failed:true, clamped:[1,1], rejected:['clone','serialize','unserialize','repeat','title-nul','create-nul','failed-constructor']});
});

test('constructor string coercion preserves a window initialized by a callback', async ({page}) => {
	await start(page);
	expect(await run(page, `${rejectHelper}
	SDL_Init(SDL_INIT_VIDEO);
	class DelayedWindow extends SDL_Window {
		function __construct() {}
		function open($title) { parent::__construct($title,0,0,32,32,SDL_WINDOW_SHOWN); }
	}
	$window=new DelayedWindow;
	$title=new class($window) {
		public $window;
		function __construct($window) { $this->window=$window; }
		function __toString() { $this->window->open('Inner'); return 'Outer'; }
	};
	$reject('reentry',fn()=>$window->open($title));
	$name=$window->GetTitle(); $id=$window->GetID();
	$window->Destroy(); unset($title); $window->open('Reopened');
	$reopened=$window->GetID()!==$id && $window->GetTitle()==='Reopened';
	$window->Destroy(); echo json_encode(compact('name','reopened','rejected'));
	`)).toEqual({name:'Inner',reopened:true,rejected:['reentry']});
});

test('window size outputs honor typed references and stop after destructor exceptions', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	class Output { public array $value=[]; }
	class ThrowOnRelease { function __destruct() { throw new LogicException('window output'); } }
	$typed=[]; $exceptions=[]; $optional=[];
	foreach(['Position','Size','MinimumSize','MaximumSize'] as $name) {
		$output=new Output; $later='sentinel'; $error='';
		try { ('SDL_GetWindow'.$name)($window,$output->value,$later); } catch(TypeError $e) { $error='typed'; }
		$typed[]=[$error,$output->value,$later];
		$first=new ThrowOnRelease; $later='sentinel'; $error='';
		try { $window->{'Get'.$name}($first,$later); } catch(LogicException $e) { $error=$e->getMessage(); }
		$exceptions[]=[$error,$later];
		try { $window->{'Get'.$name}(); $optional[]=true; } catch(ArgumentCountError $e) { $optional[]=false; }
	}
	$window->GetSize($width,$height); echo json_encode(compact('typed','exceptions','optional','width','height'));
	`)).toEqual({typed:Array(4).fill(['typed',[],'sentinel']),exceptions:Array(4).fill(['window output','sentinel']),optional:Array(4).fill(true),width:32,height:32});
});

test('window display and gamma outputs preserve types and native failure results', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	class Output { public array $array=[]; public int $integer=7; }
	$output=new Output;
	$reject('mode-type',function() use($window,$output) { SDL_GetWindowDisplayMode($window,$output->array); });
	$modeStatus=$window->GetDisplayMode($mode); $modeClass=$mode instanceof SDL_DisplayMode;
	$green='green'; $blue='blue';
	$reject('gamma-type',function() use($window,$output,&$green,&$blue) { $window->GetGammaRamp($output->integer,$green,$blue); });
	$gammaStatus=SDL_GetWindowGammaRamp($window,$red,$g,$b);
	$ramps=count($red)===256 && count($g)===256 && count($b)===256;
	$shape='unchanged'; $shapeStatus=$window->GetShapedMode($shape);
	$default=$window->SetDisplayMode(null);
	echo json_encode(compact('modeStatus','modeClass','gammaStatus','ramps','shapeStatus','shape','default','green','blue','rejected'));
	`)).toEqual({modeStatus:0,modeClass:true,gammaStatus:0,ramps:true,shapeStatus:-1,shape:'unchanged',default:0,green:'green',blue:'blue',rejected:['mode-type','gamma-type']});
});

test('window property snapshots keep the correct title key and enforce typed aliases', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	$props=get_object_vars($window);
	$keys=array_keys($props); $title=$props['title']; $width=$props['w'];
	class Output { public array $width=[]; }
	$output=new Output; $window->w=&$output->width; $window->h='sentinel'; $error='';
	try { get_object_vars($window); } catch(TypeError $e) { $error='typed'; }
	echo json_encode(['keys'=>$keys,'title'=>$title,'width'=>$width,'error'=>$error,'typed'=>$output->width,'later'=>$window->h]);
	`)).toEqual({keys:['id','flags','x','y','w','h','title'],title:'Original',width:32,error:'typed',typed:[],later:'sentinel'});
});

test('property destructors may replace a window without corrupting the old snapshot', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	class ReplaceWindow {
		public $window;
		function __construct($window) { $this->window=$window; }
		function __destruct() {
			$this->window->Destroy(); $this->window->__construct('Replacement',0,0,48,40,SDL_WINDOW_SHOWN);
		}
	}
	$id=$window->GetID(); $window->id=new ReplaceWindow($window);
	$props=get_object_vars($window); $new=$window->GetID();
	echo json_encode(['old'=>[$props['id']===$id,$props['title'],$props['w'],$props['h']],'new'=>[$new!==$id,$window->GetTitle()]]);
	`)).toEqual({old:[true,'Original',32,32],new:[true,'Replacement']});
});

test('window rectangle batches check counts and snapshot arrays across PHP getters', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	SDL_GetWindowSurface($window);
	class ChangingRect extends SDL_Rect {
		public $callback;
		function __construct($callback) { parent::__construct(0,0,2,2); $this->callback=$callback; unset($this->x); }
		function __get($name) { ($this->callback)(); return 0; }
	}
	$bad=new ChangingRect(function() { throw new LogicException('unused rectangle'); });
	$zero=$window->UpdateSurfaceRects([$bad],0); $empty=SDL_UpdateWindowSurfaceRects($window,[]);
	$partial=$window->UpdateSurfaceRects([new SDL_Rect(0,0,2,2),$bad],1);
	foreach([-1,2,2147483647] as $count) { $reject('count',fn()=>SDL_UpdateWindowSurfaceRects($window,[new SDL_Rect(0,0,2,2)],$count)); }
	$reject('type',fn()=>SDL_UpdateWindowSurfaceRects($window,[new stdClass]));
	$alias=new ChangingRect(function() use (&$alias,&$values) { $alias=null; $values=[]; });
	$values=[&$alias,new SDL_Rect(2,2,2,2)]; $changed=$window->UpdateSurfaceRects($values);
	echo json_encode(compact('zero','empty','partial','changed','values','rejected'));
	`)).toEqual({zero:0,empty:0,partial:0,changed:0,values:[],rejected:['count','count','count','type']});
});

test('window callbacks reject destroyed or reconstructed native targets and preserve exceptions', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	class CallbackRect extends SDL_Rect {
		public $callback;
		function __construct($callback) { parent::__construct(0,0,2,2); $this->callback=$callback; unset($this->x); }
		function __get($name) { ($this->callback)(); return 0; }
	}
	foreach(['destroy','replace'] as $action) {
		SDL_GetWindowSurface($window);
		$rect=new CallbackRect(function() use ($window,$action) {
			$window->Destroy();
			if($action==='replace') { $window->__construct('New',0,0,32,32,SDL_WINDOW_SHOWN); SDL_GetWindowSurface($window); }
		});
		$reject($action,fn()=>SDL_UpdateWindowSurfaceRects($window,[$rect]));
		$window->Destroy(); $window->__construct('Next',0,0,32,32,SDL_WINDOW_SHOWN);
	}
	class CallbackMode extends SDL_DisplayMode {
		public $callback;
		function __construct($callback) { parent::__construct(0,32,32,0); $this->callback=$callback; unset($this->w); }
		function __get($name) { ($this->callback)(); return 32; }
	}
	$mode=new CallbackMode(fn()=>$window->Destroy());
	$reject('mode-destroy',fn()=>SDL_SetWindowDisplayMode($window,$mode));
	$window->__construct('Final',0,0,32,32,SDL_WINDOW_SHOWN);
	$mode=new CallbackMode(function() { throw new LogicException('original mode error'); });
	$error=''; try { SDL_SetWindowDisplayMode($window,$mode); } catch(LogicException $e) { $error=$e->getMessage(); }
	echo json_encode(compact('rejected','error'));
	`)).toEqual({rejected:['destroy','replace','mode-destroy'],error:'original mode error'});
});

test('window GC observes references without refreshing properties or running their destructors', async ({page}) => {
	await start(page);
	expect(await run(page, `
	SDL_Init(SDL_INIT_VIDEO); $released=0;
	class Payload { function __destruct() { $GLOBALS['released']++; } }
	$window=new SDL_Window('GC',0,0,32,32,SDL_WINDOW_SHOWN); $weak=WeakReference::create($window);
	$window->title=new Payload; $alias=$window; unset($window); gc_collect_cycles();
	$before=[$released,$alias->title instanceof Payload,$weak->get()===$alias];
	$properties=get_object_vars($alias);
	$after=[$released,$properties['title'],$alias->GetTitle()];
	SDL_DestroyWindow($alias); unset($alias); gc_collect_cycles(); $collected=$weak->get()===null;
	SDL_Quit(); echo json_encode(compact('before','after','collected'));
	`)).toEqual({before:[0,true,true],after:[1,'GC','GC'],collected:true});
});

test('window GC retains property-array aliases and collects declared and dynamic cycles', async ({page}) => {
	await start(page);
	expect(await run(page, `
	SDL_Init(SDL_INIT_VIDEO); $results=[];
	class DeclaredCycle extends SDL_Window { public $self; }
	foreach([false,true] as $enumerate) {
		$window=new DeclaredCycle('Cycle',0,0,32,32,SDL_WINDOW_SHOWN); $window->self=$window;
		$weak=WeakReference::create($window);
		if($enumerate) {
			$properties=get_object_vars($window); $copy=$properties; unset($window); gc_collect_cycles();
			$results[]=$weak->get()===$copy['self']; unset($properties); gc_collect_cycles();
			$results[]=$weak->get()===$copy['self']; unset($copy);
		} else { unset($window); }
		gc_collect_cycles(); $results[]=$weak->get()===null;
	}
	$window=new SDL_Window('Dynamic',0,0,32,32,SDL_WINDOW_SHOWN); @$window->self=$window;
	$weak=WeakReference::create($window); unset($window); gc_collect_cycles(); $results[]=$weak->get()===null;
	SDL_Quit(); echo json_encode($results);
	`)).toEqual(Array(5).fill(true));
	expect((await allocationStats(page)).sdlAllocations).toBe(0);
});

test('window property cycles release native windows across collection and video restarts', async ({page}) => {
	await start(page);
	await run(page, `
	SDL_Init(SDL_INIT_VIDEO);
	function windows($count) {
		$refs=[]; $event=new SDL_Event;
		for($i=0;$i<$count;$i++) {
			$window=new SDL_Window('Churn',0,0,32,32,SDL_WINDOW_SHOWN);
			@$window->self=$window; $refs[]=WeakReference::create($window);
			unset($window); gc_collect_cycles(); while(SDL_PollEvent($event)) {}
		}
		return count(array_filter($refs,fn($ref)=>$ref->get()!==null));
	}
	if(windows(10)) { throw new RuntimeException('window warmup retained owners'); }
	`);
	const before = await allocationStats(page);
	for(let batch=0; batch<3; batch++)
	{
		expect(await run(page, 'echo json_encode(windows(50));')).toBe(0);
		const after = await allocationStats(page);
		expect(after.sdlAllocations).toBe(before.sdlAllocations);
		expect(after.liveBytes - before.liveBytes).toBeLessThan(128 * 1024);
	}
	expect(await run(page, `${rejectHelper}
	$window=new SDL_Window('Restart',0,0,32,32,SDL_WINDOW_SHOWN);
	SDL_InitSubSystem(SDL_INIT_VIDEO); SDL_QuitSubSystem(SDL_INIT_VIDEO); $alive=$window->GetTitle()==='Restart';
	SDL_QuitSubSystem(SDL_INIT_VIDEO); $reject('video-quit',fn()=>$window->GetID());
	SDL_InitSubSystem(SDL_INIT_VIDEO); $window->__construct('Again',0,0,32,32,SDL_WINDOW_SHOWN);
	$new=$window->GetTitle()==='Again'; $window->Destroy(); SDL_Quit(); echo json_encode(compact('alive','new','rejected'));
	`)).toEqual({alive:true,new:true,rejected:['video-quit']});
	expect((await allocationStats(page)).sdlAllocations).toBe(0);
});

test('joystick and controller objects reject copied native ownership', async ({page}) => {
	await page.addInitScript(() => {
		const pad = {id:'Standard Gamepad',index:0,connected:true,mapping:'standard',timestamp:1,axes:[0,0,0,0]
			, buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
		Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
	});
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	SDL_InitSubSystem(SDL_INIT_GAMECONTROLLER);
	$controller=SDL_GameControllerOpen(0); $joystick=SDL_GameControllerGetJoystick($controller);
	foreach([$controller,$joystick] as $input) {
		$reject('clone',fn()=>clone $input); $reject('serialize',fn()=>serialize($input));
		$name=get_class($input); $reject('unserialize',fn()=>unserialize('O:'.strlen($name).':"'.$name.'":0:{}'));
	}
	$attached=SDL_GameControllerGetAttached($controller) && SDL_JoystickGetAttached($joystick);
	SDL_GameControllerClose($controller); SDL_JoystickClose($joystick); SDL_Quit();
	echo json_encode(compact('attached','rejected'));
	`)).toEqual({attached:true,rejected:['clone','serialize','unserialize','clone','serialize','unserialize']});
});
