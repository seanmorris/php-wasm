import {test, expect} from '@playwright/test';
import {start, run, windowSetup} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'Requires the SDL runtime artifact');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const rendererSetup = `${windowSetup}
$renderer=SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED | SDL_RENDERER_TARGETTEXTURE);
if(!$renderer) { throw new RuntimeException(SDL_GetError()); }
$check=function($status) { if($status!==0) { throw new RuntimeException(SDL_GetError()); } };
`;
const cleanup = 'SDL_DestroyWindow($window); SDL_Quit();';

test('SDL coordinate conversion matches letterboxed and integer-scaled pixels', async ({page}) => {
	await start(page);
	const result = await run(page, `${rendererSetup}
	$check(SDL_RenderSetLogicalSize($renderer,32,16));
	$forward=SDL_RenderWindowToLogical($renderer,24,28,$x,$y); $logical=[$x,$y];
	$reverse=SDL_RenderLogicalToWindow($renderer,$x,$y,$wx,$wy); $windowPoint=[$wx,$wy];
	SDL_RenderWindowToLogical($renderer,0,0,$x,$y); $letterbox=[$x,$y];
	SDL_SetRenderDrawColor($renderer,0,0,0,255); $check(SDL_RenderClear($renderer));
	SDL_SetRenderDrawColor($renderer,0,255,0,255);
	$check(SDL_RenderFillRectF($renderer,new SDL_FRect(...[...$logical,2,2])));
	$check(SDL_RenderSetLogicalSize($renderer,0,0));
	$pixels=[];
	foreach([[24,28],[23,28],[28,28]] as [$px,$py]) {
		$pixels[]=bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect($px,$py,1,1),SDL_PIXELFORMAT_ABGR8888));
	}
	$check(SDL_RenderSetLogicalSize($renderer,50,25));
	$check(SDL_RenderSetIntegerScale($renderer,true));
	SDL_RenderWindowToLogical($renderer,17,24,$x,$y); $integerLogical=[$x,$y];
	SDL_RenderLogicalToWindow($renderer,$x,$y,$wx,$wy); $integerWindow=[$wx,$wy];
	${cleanup}
	echo json_encode(compact('forward','reverse','logical','windowPoint','letterbox','pixels','integerLogical','integerWindow'));
	`);
	expect(result).toEqual({forward:null,reverse:null,logical:[12,6],windowPoint:[24,28]
		,letterbox:[0,-8],pixels:['00ff00ff','000000ff','000000ff'],integerLogical:[10,5],integerWindow:[17,24]});
});

test('SDL coordinate conversion preserves fractional viewports, target state and resizing', async ({page}) => {
	await start(page);
	const result = await run(page, `${rendererSetup}
	$check(SDL_RenderSetScale($renderer,1.25,.5));
	$check(SDL_RenderSetViewport($renderer,new SDL_Rect(3,5,40,40)));
	SDL_RenderLogicalToWindow($renderer,2.5,5,$wx,$wy); $fractional=[$wx,$wy];
	SDL_RenderWindowToLogical($renderer,$wx,$wy,$x,$y); $inverse=[$x,$y];
	$check(SDL_RenderSetScale($renderer,2,4));
	SDL_RenderLogicalToWindow($renderer,1,1,$wx,$wy); $rescaled=[$wx,$wy];
	$texture=SDL_CreateTexture($renderer,SDL_PIXELFORMAT_ABGR8888,SDL_TEXTUREACCESS_TARGET,16,16);
	$check(SDL_SetRenderTarget($renderer,$texture));
	SDL_RenderLogicalToWindow($renderer,3,7,$wx,$wy); $target=[$wx,$wy];
	$check(SDL_SetRenderTarget($renderer,null));
	SDL_RenderLogicalToWindow($renderer,1,1,$wx,$wy); $restored=[$wx,$wy];
	$check(SDL_RenderSetLogicalSize($renderer,32,16));
	SDL_SetWindowSize($window,128,64); SDL_PumpEvents();
	SDL_RenderWindowToLogical($renderer,64,32,$x,$y); $resizedLogical=[$x,$y];
	SDL_RenderLogicalToWindow($renderer,16,8,$wx,$wy); $resizedWindow=[$wx,$wy];
	${cleanup}
	echo json_encode(compact('fractional','inverse','rescaled','target','restored','resizedLogical','resizedWindow'));
	`);
	expect(result.fractional).toEqual([6,5]);
	expect(result.inverse[0]).toBeCloseTo(1.8,6);
	expect(result.inverse[1]).toBe(5);
	expect(result.rescaled).toEqual([5,6]);
	expect(result.target).toEqual([3,7]);
	expect(result.restored).toEqual([5,6]);
	expect(result.resizedLogical).toEqual([16,8]);
	expect(result.resizedWindow).toEqual([64,32]);
});

test('SDL logical mouse events agree with conversion of the original window position', async ({page}) => {
	await start(page);
	await run(page, `${rendererSetup}
	$check(SDL_RenderSetLogicalSize($renderer,32,16));
	$event=new SDL_Event; while(SDL_PollEvent($event)) {}
	`);
	const canvas = page.locator('canvas');
	const bounds = await canvas.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.move(bounds.x + 24, bounds.y + 28);
	const result = await run(page, `
	$motions=[];
	while(SDL_PollEvent($event)) {
		if($event->type===SDL_MOUSEMOTION) { $motions[]=[$event->motion->x,$event->motion->y]; }
	}
	SDL_RenderWindowToLogical($renderer,24,28,$x,$y); $converted=[$x,$y];
	${cleanup}
	echo json_encode(compact('motions','converted'));
	`);
	expect(result.converted).toEqual([12,6]);
	expect(result.motions).toContainEqual(result.converted);
});

test('SDL coordinate conversion rejects nonfinite and overflowing transforms before publishing outputs', async ({page}) => {
	await start(page);
	const result = await run(page, `${rendererSetup}
	$errors=[]; $unchanged=[];
	$reject=function($callback) use (&$errors,&$unchanged) {
		$x=123; $y=456;
		try { $callback($x,$y); $errors[]='accepted'; }
		catch(Throwable $error) { $errors[]=get_class($error); }
		$unchanged[]=[$x,$y];
	};
	foreach([[NAN,0],[0,INF],[3.5e38,0],[0,3e9],[-3e9,0]] as [$x,$y]) {
		$reject(function(&$wx,&$wy) use($renderer,$x,$y) { SDL_RenderLogicalToWindow($renderer,$x,$y,$wx,$wy); });
	}
	$check(SDL_RenderSetScale($renderer,1e10,1));
	$reject(function(&$x,&$y) use($renderer) { SDL_RenderLogicalToWindow($renderer,3e30,0,$x,$y); });
	$check(SDL_RenderSetScale($renderer,1,1));
	SDL_RenderLogicalToWindow($renderer,1000000000,-1000000000,$wx,$wy); $large=[$wx,$wy];
	$check(SDL_RenderSetScale($renderer,-2,-.5));
	SDL_RenderLogicalToWindow($renderer,3,4,$wx,$wy); $negative=[$wx,$wy];
	SDL_RenderWindowToLogical($renderer,$wx,$wy,$x,$y); $inverse=[$x,$y];
	foreach([0,1e-40] as $scale) {
		$check(SDL_RenderSetScale($renderer,$scale,$scale));
		$reject(function(&$x,&$y) use($renderer) { SDL_RenderWindowToLogical($renderer,1000000000,4,$x,$y); });
		$reject(function(&$x,&$y) use($renderer) { SDL_RenderLogicalToWindow($renderer,1,1,$x,$y); });
	}
	$check(SDL_RenderSetScale($renderer,1,1));
	SDL_DestroyRenderer($renderer);
	$reject(function(&$x,&$y) use($renderer) { SDL_RenderWindowToLogical($renderer,1,2,$x,$y); });
	$reject(function(&$x,&$y) use($renderer) { SDL_RenderLogicalToWindow($renderer,1,2,$x,$y); });
	${cleanup}
	echo json_encode(compact('errors','unchanged','large','negative','inverse'));
	`);
	expect(result.errors).toEqual([...Array(10).fill('ValueError'),'TypeError','TypeError']);
	expect(result.unchanged).toEqual(Array(12).fill([123,456]));
	expect(result.large).toEqual([1000000000,-1000000000]);
	expect(result.negative).toEqual([-6,-2]);
	expect(result.inverse).toEqual([3,4]);
});

test('SDL coordinate outputs respect typed references, aliases and destructive callbacks', async ({page}) => {
	await start(page);
	const result = await run(page, `${rendererSetup}
	$holder=new class { public array $value=[]; }; $errors=[]; $untouched=[];
	foreach(['SDL_RenderWindowToLogical','SDL_RenderLogicalToWindow'] as $function) {
		$second=37;
		try { $function($renderer,3,9,$holder->value,$second); }
		catch(TypeError $error) { $errors[]='TypeError'; }
		$untouched[]=$second;
	}
	SDL_RenderWindowToLogical($renderer,3,9,$alias,$alias); $aliases=[$alias];
	SDL_RenderLogicalToWindow($renderer,4,8,$alias,$alias); $aliases[]=$alias;
	class CoordinateFailure {
		public function __destruct() { throw new RuntimeException('coordinate output'); }
	}
	foreach(['SDL_RenderWindowToLogical','SDL_RenderLogicalToWindow'] as $function) {
		$first=new CoordinateFailure; $second=52;
		try { $function($renderer,3,9,$first,$second); }
		catch(RuntimeException $error) { $errors[]=$error->getMessage(); }
		$untouched[]=$second;
	}
	class CoordinateRelease {
		public function __destruct() { SDL_DestroyRenderer($GLOBALS['renderer']); $GLOBALS['released']++; }
	}
	$released=0; $snapshots=[];
	foreach(['SDL_RenderWindowToLogical','SDL_RenderLogicalToWindow'] as $function) {
		$first=new CoordinateRelease; $second=null;
		$function($renderer,3,9,$first,$second); $snapshots[]=[$first,$second];
		if($released===1) { $renderer=SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED); }
	}
	${cleanup}
	echo json_encode(compact('errors','untouched','aliases','snapshots','released'));
	`);
	expect(result).toEqual({errors:['TypeError','TypeError','coordinate output','coordinate output']
		,untouched:[37,37,52,52],aliases:[9,8],snapshots:[[3,9],[3,9]],released:2});
});
