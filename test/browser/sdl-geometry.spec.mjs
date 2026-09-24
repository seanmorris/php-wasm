import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, windowSetup} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'Requires the SDL runtime artifact');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const rendererSetup = String.raw`${windowSetup}
$renderer = SDL_CreateRenderer($window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_TARGETTEXTURE);
if(!$renderer) { throw new RuntimeException(SDL_GetError()); }
$check = function($status) { if($status !== 0) { throw new RuntimeException(SDL_GetError()); } };
$pixel = function($x,$y) use ($renderer) {
	return array_values(unpack('C*',SDL_RenderReadPixels($renderer,new SDL_Rect($x,$y,1,1),SDL_PIXELFORMAT_ABGR8888)));
};
$clear = function() use ($renderer,$check) {
	$check(SDL_SetRenderDrawColor($renderer,0,0,0,255)); $check(SDL_RenderClear($renderer));
};
$clear();
`;
const cleanup = 'SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();';

test('SDL geometry draws indexed, textured and alpha-blended triangles', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rendererSetup}${rejectHelper}
	$quad = function($left,$right,$color) {
		return [[$left,0,...$color,0,0],[$right,0,...$color,1,0],[$right,64,...$color,1,1],[$left,64,...$color,0,1]];
	};
	$indices = [0,1,2,0,2,3]; $red = $quad(0,32,[255,0,0,255]);
	$check(SDL_RenderGeometry($renderer,null,$red,$indices));
	$colored = [$pixel(16,32),$pixel(48,32)];
	$texture = SDL_CreateTexture($renderer,SDL_PIXELFORMAT_ABGR8888,SDL_TEXTUREACCESS_STATIC,1,1);
	$check(SDL_UpdateTexture($texture,null,"\x00\x00\xff\xff",4));
	$check(SDL_SetTextureBlendMode($texture,SDL_BLENDMODE_NONE));
	// Geometry uses vertex modulation, even when the texture has color/alpha mods.
	SDL_SetTextureColorMod($texture,0,0,0); SDL_SetTextureAlphaMod($texture,0);
	$right = $quad(32,64,[255,255,255,255]);
	$check(SDL_RenderGeometry($renderer,$texture,$right,$indices));
	$textured = $pixel(48,32);
	$check(SDL_SetRenderDrawBlendMode($renderer,SDL_BLENDMODE_BLEND));
	$green = $quad(32,64,[0,255,0,128]);
	$sequential = array_map(function($index) use ($green) { return $green[$index]; },$indices);
	$check(SDL_RenderGeometry($renderer,null,$sequential)); $blended = $pixel(48,32);
	$empty = [SDL_RenderGeometry($renderer,null,[]),SDL_RenderGeometry($renderer,null,$red,[])];
	$badUv = $right; $badUv[0][6] = -.1;
	$nativeFailure = [SDL_RenderGeometry($renderer,$texture,$badUv,$indices),SDL_GetError() !== ''];
	$reject('incomplete',function() use ($renderer,$red){SDL_RenderGeometry($renderer,null,$red);});
	$reject('tuple',function() use ($renderer){SDL_RenderGeometry($renderer,null,[[0],[0],[0]]);});
	$bad = $red; $bad[0][0] = INF;
	$reject('nonfinite',function() use ($renderer,$bad,$indices){SDL_RenderGeometry($renderer,null,$bad,$indices);});
	$bad = $red; $bad[0][2] = 256;
	$reject('color',function() use ($renderer,$bad,$indices){SDL_RenderGeometry($renderer,null,$bad,$indices);});
	$bad = $red; $bad[0][0] = '12';
	$reject('coordinate-type',function() use ($renderer,$bad,$indices){SDL_RenderGeometry($renderer,null,$bad,$indices);});
	foreach([[-1,1,2],[0,1,4],[0,1,'2']] as $bad) {
		$reject('index',function() use ($renderer,$red,$bad){SDL_RenderGeometry($renderer,null,$red,$bad);});
	}
	SDL_DestroyTexture($texture);
	$reject('dead-texture',function() use ($renderer,$texture,$right,$indices){SDL_RenderGeometry($renderer,$texture,$right,$indices);});
	${cleanup}
	$reject('dead-renderer',function() use ($renderer,$red,$indices){SDL_RenderGeometry($renderer,null,$red,$indices);});
	echo json_encode(compact('colored','textured','blended','empty','nativeFailure','rejected'));
	`);
	expect(result.colored).toEqual([[255,0,0,255], [0,0,0,255]]);
	expect(result.textured).toEqual([0,0,255,255]);
	expect(result.blended[0]).toBe(0);
	expect(Math.abs(result.blended[1] - 128)).toBeLessThanOrEqual(1);
	expect(Math.abs(result.blended[2] - 127)).toBeLessThanOrEqual(1);
	expect(result.blended[3]).toBe(255);
	expect(result.empty).toEqual([0,0]);
	expect(result.nativeFailure).toEqual([-1,true]);
	expect(result.rejected).toEqual(['incomplete','tuple','nonfinite','color','coordinate-type','index','index','index','dead-texture','dead-renderer']);
});

test('SDL raw geometry checks padded buffers and all index widths', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rendererSetup}${rejectHelper}
	$xy = pack('g*',0,0,99,64,0,99,64,64,99,0,64,99);
	$colors = "\x00\xff\x00\xff"; $uv = pack('g*',0,0,99,1,0,99,1,1,99,0,1,99);
	$output = [];
	foreach([1=>'C*',2=>'v*',4=>'V*'] as $width=>$format) {
		$clear(); $indices = pack($format,0,1,2,0,2,3);
		$check(SDL_RenderGeometryRaw($renderer,null,$xy,12,$colors,0,null,0,4,$indices,6,$width));
		$output[] = $pixel(32,32);
	}
	$texture = SDL_CreateTexture($renderer,SDL_PIXELFORMAT_ABGR8888,SDL_TEXTUREACCESS_STATIC,1,1);
	SDL_UpdateTexture($texture,null,"\xff\x00\xff\xff",4);
	$check(SDL_RenderGeometryRaw($renderer,$texture,$xy,12,"\xff\xff\xff\xff",0,$uv,12,4,$indices,6));
	$textured = $pixel(32,32);
	$sequential = pack('g*',0,0,64,0,0,64);
	$check(SDL_RenderGeometryRaw($renderer,null,$sequential,8,"\xff\xff\x00\xff",0,null,0,3));
	$unindexed = $pixel(4,4);
	$empty = SDL_RenderGeometryRaw($renderer,null,'',0,'',0,null,0,0);
	$repeat = SDL_RenderGeometryRaw($renderer,null,pack('g*',0,0),0,$colors,0,null,0,3);
	$reject('short-xy',function() use ($renderer,$colors){SDL_RenderGeometryRaw($renderer,null,'',8,$colors,0,null,0,3);});
	$reject('short-color',function() use ($renderer,$sequential){SDL_RenderGeometryRaw($renderer,null,$sequential,8,'x',0,null,0,3);});
	$reject('alignment',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,7,$colors,0,null,0,3);});
	$reject('negative-stride',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,-1,$colors,0,null,0,3);});
	$reject('overflow',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,2147483647,$colors,0,null,0,3);});
	$reject('vertex-allocation-overflow',function() use ($renderer,$colors){SDL_RenderGeometryRaw($renderer,null,pack('g*',0,0),0,$colors,0,null,0,1073741823);});
	$reject('index-allocation-overflow',function() use ($renderer,$colors){SDL_RenderGeometryRaw($renderer,null,pack('g*',0,0),0,$colors,0,null,0,3,'',1073741823,1);});
	$reject('nan',function() use ($renderer,$colors){SDL_RenderGeometryRaw($renderer,null,pack('g*',NAN,0),0,$colors,0,null,0,3);});
	$reject('incomplete',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,12,$colors,0,null,0,4);});
	$reject('missing-uv',function() use ($renderer,$texture,$xy,$colors,$indices){SDL_RenderGeometryRaw($renderer,$texture,$xy,12,$colors,0,null,0,4,$indices,6);});
	$reject('short-uv',function() use ($renderer,$texture,$xy,$colors,$indices){SDL_RenderGeometryRaw($renderer,$texture,$xy,12,$colors,0,'',8,4,$indices,6);});
	$reject('index-size',function() use ($renderer,$xy,$colors,$indices){SDL_RenderGeometryRaw($renderer,null,$xy,12,$colors,0,null,0,4,$indices,6,3);});
	$reject('short-index',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,12,$colors,0,null,0,4,'x',6,2);});
	$reject('index-range',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,12,$colors,0,null,0,4,pack('C*',0,1,4),3,1);});
	$reject('missing-index',function() use ($renderer,$xy,$colors){SDL_RenderGeometryRaw($renderer,null,$xy,12,$colors,0,null,0,4,null,6);});
	SDL_DestroyTexture($texture); ${cleanup}
	echo json_encode(compact('output','textured','unindexed','empty','repeat','rejected'));
	`);
	expect(result.output).toEqual(Array(3).fill([0,255,0,255]));
	expect(result.textured).toEqual([255,0,255,255]);
	expect(result.unindexed).toEqual([255,255,0,255]);
	expect([result.empty, result.repeat]).toEqual([0,0]);
	expect(result.rejected).toEqual(['short-xy','short-color','alignment','negative-stride','overflow','vertex-allocation-overflow','index-allocation-overflow','nan','incomplete','missing-uv','short-uv','index-size','short-index','index-range','missing-index']);
});

test('SDL integer and float primitive batches draw pixels and survive hostile getters', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rendererSetup}${rejectHelper}
	$output = []; $empty = [];
	foreach(['','F'] as $suffix) {
		$point = $suffix ? SDL_FPoint::class : SDL_Point::class;
		$rect = $suffix ? SDL_FRect::class : SDL_Rect::class;
		foreach([
			['DrawPoints',[new $point(10,10),new $point(20,20)],10,10],
			['DrawLines',[new $point(8,8),new $point(20,8),new $point(20,20)],14,8],
			['DrawRects',[new $rect(8,8,20,20)],8,15],
			['FillRects',[new $rect(8,8,20,20)],15,15]
		] as [$name,$values,$x,$y]) {
			$clear(); SDL_SetRenderDrawColor($renderer,255,0,0,255);
			$fn = 'SDL_Render'.$name.$suffix;
			$check($fn($renderer,$values)); $output[] = $pixel($x,$y);
			$empty[] = $fn($renderer,[]);
		}
	}
	$reject('wrong-object',function() use ($renderer){SDL_RenderDrawPoints($renderer,[new stdClass]);});
	$reject('wrong-class',function() use ($renderer){SDL_RenderDrawRects($renderer,[new SDL_Point(0,0)]);});
	$reject('nonfinite',function() use ($renderer){SDL_RenderDrawPointsF($renderer,[new SDL_FPoint(INF,0)]);});
	$changing = new class(30,30) extends SDL_Point {
		public $change;
		public function __get($name) { ($this->change)(); return 30; }
	};
	$alias = $changing; $values = [&$alias];
	$changing->change = function() use (&$alias,&$values) { $alias=null; $values=array_fill(0,100,new SDL_Point(0,0)); };
	unset($changing->x);
	$check(SDL_RenderDrawPoints($renderer,$values)); $changed = $pixel(30,30);
	$point = new class(1,1) extends SDL_Point {
		public $renderer;
		public function __get($name) { SDL_DestroyRenderer($this->renderer); return 1; }
	};
	$point->renderer = $renderer; unset($point->x);
	$reject('destroy-in-getter',function() use ($renderer,$point){SDL_RenderDrawPoints($renderer,[$point]);});
	SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('output','empty','rejected','changed'));
	`);
	expect(result.output).toEqual(Array(8).fill([255,0,0,255]));
	expect(result.empty).toEqual(Array(8).fill(0));
	expect(result.changed).toEqual([255,0,0,255]);
	expect(result.rejected).toEqual(['wrong-object','wrong-class','nonfinite','destroy-in-getter']);
});

test('SDL renderer queries, clipping, viewport and scaling match the drawn output', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rendererSetup}${rejectHelper}
	$drivers = [];
	for($i=0;$i<SDL_GetNumRenderDrivers();$i++) { $check(SDL_GetRenderDriverInfo($i,$info)); $drivers[]=$info; }
	$check(SDL_GetRendererInfo($renderer,$active)); $target = SDL_RenderTargetSupported($renderer);
	$check(SDL_SetRenderDrawColor($renderer,10,20,30,40));
	$check(SDL_GetRenderDrawColor($renderer,$r,$g,$b,$a)); $color=[$r,$g,$b,$a];
	$check(SDL_SetRenderDrawBlendMode($renderer,SDL_BLENDMODE_BLEND));
	$check(SDL_GetRenderDrawBlendMode($renderer,$blend));
	$check(SDL_SetRenderDrawBlendMode($renderer,SDL_BLENDMODE_NONE));
	$check(SDL_RenderSetViewport($renderer,new SDL_Rect(8,8,40,40)));
	$check(SDL_RenderSetClipRect($renderer,new SDL_Rect(4,4,8,8)));
	SDL_RenderGetViewport($renderer,$viewport); SDL_RenderGetClipRect($renderer,$clip);
	$clipping = SDL_RenderIsClipEnabled($renderer);
	SDL_SetRenderDrawColor($renderer,255,0,0,255);
	$check(SDL_RenderFillRects($renderer,[new SDL_Rect(0,0,40,40)]));
	// Reset view before readback, which also uses viewport-relative coordinates.
	$check(SDL_RenderSetViewport($renderer,null));
	$clipped = [$pixel(10,10),$pixel(14,14),$pixel(22,22)];
	$check(SDL_RenderSetClipRect($renderer,null)); $disabled = SDL_RenderIsClipEnabled($renderer);
	$check(SDL_RenderSetLogicalSize($renderer,32,32));
	SDL_RenderGetLogicalSize($renderer,$w,$h); $logical=[$w,$h];
	$check(SDL_RenderSetIntegerScale($renderer,true)); $integer=SDL_RenderGetIntegerScale($renderer);
	SDL_RenderGetScale($renderer,$x,$y); $logicalScale=[$x,$y];
	$clear(); SDL_SetRenderDrawColor($renderer,0,255,0,255);
	$check(SDL_RenderFillRects($renderer,[new SDL_Rect(4,4,4,4)]));
	$check(SDL_RenderSetLogicalSize($renderer,0,0));
	$scaled = [$pixel(9,9),$pixel(17,17)];
	$check(SDL_RenderSetScale($renderer,2,3)); SDL_RenderGetScale($renderer,$x,$y); $scale=[$x,$y];
	$clear(); SDL_SetRenderDrawColor($renderer,0,0,255,255);
	$check(SDL_RenderFillRectsF($renderer,[new SDL_FRect(4,4,4,4)]));
	$check(SDL_RenderSetScale($renderer,1,1));
	$explicit = [$pixel(9,13),$pixel(17,25)];
	$reject('negative-viewport',function() use ($renderer){SDL_RenderSetViewport($renderer,new SDL_Rect(0,0,-1,2));});
	$reject('negative-logical',function() use ($renderer){SDL_RenderSetLogicalSize($renderer,-1,2);});
	$reject('nonfinite-scale',function() use ($renderer){SDL_RenderSetScale($renderer,NAN,1);});
	$reject('driver-index',function(){SDL_GetRenderDriverInfo(-1,$info);});
	$holder = new class {public int $value=0;};
	$reject('output-type',function() use ($renderer,$holder){SDL_GetRendererInfo($renderer,$holder->value);});
	$reject('rect-output-type',function() use ($renderer,$holder){SDL_RenderGetViewport($renderer,$holder->value);});
	$badDriver = SDL_GetRenderDriverInfo(SDL_GetNumRenderDrivers(),$info);
	${cleanup}
	echo json_encode(compact('drivers','active','target','color','blend','viewport','clip','clipping','disabled','clipped','logical','integer','logicalScale','scaled','scale','explicit','rejected','badDriver'));
	`);
	expect(result.drivers.length).toBeGreaterThan(0);
	for(const info of [...result.drivers, result.active])
	{
		expect(info.name).toBeTruthy();
		expect(info.texture_formats).toHaveLength(info.num_texture_formats);
	}
	expect(result.target).toBe(true);
	expect(result.color).toEqual([10,20,30,40]);
	expect(result.blend).toBe(1);
	expect(result.viewport).toMatchObject({x:8,y:8,w:40,h:40});
	expect(result.clip).toMatchObject({x:4,y:4,w:8,h:8});
	expect([result.clipping, result.disabled]).toEqual([true,false]);
	expect(result.clipped).toEqual([[0,0,0,255],[255,0,0,255],[0,0,0,255]]);
	expect(result.logical).toEqual([32,32]);
	expect(result.integer).toBe(true);
	expect(result.logicalScale).toEqual([2,2]);
	expect(result.scaled).toEqual([[0,255,0,255],[0,0,0,255]]);
	expect(result.scale).toEqual([2,3]);
	expect(result.explicit).toEqual([[0,0,255,255],[0,0,0,255]]);
	expect(result.rejected).toEqual(['negative-viewport','negative-logical','nonfinite-scale','driver-index','output-type','rect-output-type']);
	expect(result.badDriver).toBe(-1);
});
