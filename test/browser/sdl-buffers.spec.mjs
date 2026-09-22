import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, windowSetup} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const surface = String.raw`
function surface($width = 2, $height = 2) {
	return new SDL_Surface(0,$width,$height,32,0xff,0xff00,0xff0000,-16777216);
}
function bytes($pixels) {
	$result = [];
	for($i = 0; $i < $pixels->count(); $i++) { $result[] = $pixels[$i]; }
	return $result;
}
`;
const renderer = String.raw`${windowSetup}
$renderer = SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED);
if(!$renderer) { throw new RuntimeException(SDL_GetError()); }
function texture($renderer) {
	return SDL_CreateTexture($renderer,SDL_PIXELFORMAT_ABGR8888,SDL_TEXTUREACCESS_STREAMING,2,2);
}
`;

test('pixel conversion writes the destination, handles overlap and validates byte ranges', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${surface}${rejectHelper}
	$src = new SDL_Pixels(8,2); $dst = new SDL_Pixels(12,2);
	foreach([1,2,3,4,9,9,9,9,10,20,30,40,9,9,9,9] as $i => $value) { $src[$i] = $value; }
	for($i = 0; $i < $dst->count(); $i++) { $dst[$i] = 77; }
	$before = bytes($src);
	$status = SDL_ConvertPixels(1,2,SDL_PIXELFORMAT_RGBA8888,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12);
	$source = bytes($src); $destination = bytes($dst);
	$overlap = SDL_ConvertPixels(1,2,SDL_PIXELFORMAT_RGBA8888,$src,8,SDL_PIXELFORMAT_ABGR8888,$src,8);
	$inPlace = bytes($src);
	$empty = SDL_ConvertPixels(0,0,SDL_PIXELFORMAT_RGBA8888,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12);

	echo json_encode(compact('status','before','source','destination','overlap','inPlace','empty'));
	`);
	expect(result.status).toBe(0);
	expect(result.source).toEqual(result.before);
	expect(result.destination).toEqual([4, 3, 2, 1, ...Array(8).fill(77), 40, 30, 20, 10, ...Array(8).fill(77)]);
	expect(result.inPlace).toEqual([4, 3, 2, 1, 9, 9, 9, 9, 40, 30, 20, 10, 9, 9, 9, 9]);
	expect([result.overlap, result.empty]).toEqual([0, 0]);
	const invalid = await run(page, String.raw`
	$reject('negative-width',fn() => SDL_ConvertPixels(-1,1,SDL_PIXELFORMAT_RGBA8888,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$reject('negative-pitch',fn() => SDL_ConvertPixels(1,1,SDL_PIXELFORMAT_RGBA8888,$src,-8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$reject('short-row',fn() => SDL_ConvertPixels(3,1,SDL_PIXELFORMAT_RGBA8888,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$reject('short-buffer',fn() => SDL_ConvertPixels(1,3,SDL_PIXELFORMAT_RGBA8888,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$reject('indexed',fn() => SDL_ConvertPixels(1,1,SDL_PIXELFORMAT_INDEX8,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$reject('planar',fn() => SDL_ConvertPixels(1,1,SDL_PIXELFORMAT_YV12,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$reject('invalid-format',fn() => SDL_ConvertPixels(1,1,0,$src,8,SDL_PIXELFORMAT_ABGR8888,$dst,12));
	$aligned = new SDL_Pixels(3,1);
	foreach([[0,1],[-1,1],[2147483647,1],[1073741824,2]] as $size) {
		$reject('size',fn() => new SDL_Pixels(...$size));
	}
	echo json_encode(['rejected'=>$rejected,'aligned'=>$aligned->pitch]);
	`);
	expect(invalid.aligned).toBe(4);
	expect(invalid.rejected).toEqual(['negative-width', 'negative-pitch', 'short-row', 'short-buffer', 'indexed', 'planar', 'invalid-format', 'size', 'size', 'size', 'size']);
});

test('surface views retain owners and reject access after explicit destruction', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${surface}${rejectHelper}
	$s = surface(); $weak = WeakReference::create($s);
	$pixels = $s->pixels; $format = $s->format;
	unset($s); gc_collect_cycles();
	$pixels[0] = 42; $alive = [$weak->get() !== null,$pixels->GetByte(0,0),$format->BytesPerPixel];
	$reject('borrowed-format',fn() => SDL_FreeFormat($format));
	SDL_FreeSurface($weak->get());
	$reject('byte',fn() => $pixels[0]);
	$reject('byte-method',fn() => $pixels->SetByte(0,0,1));
	$reject('metadata',fn() => $pixels->pitch);
	$reject('count',fn() => $pixels->count());
	$reject('exists',fn() => $pixels->offsetExists(0));
	$reject('format',fn() => $format->BytesPerPixel);
	$reject('map',fn() => SDL_MapRGB($format,1,2,3));
	$reject('debug',fn() => get_object_vars($format));
	$reject('surface-reinit',fn() => $weak->get()->__construct(0,2,2,32,0,0,0,0));
	unset($pixels,$format); gc_collect_cycles(); $gone = $weak->get() === null;
	class PixelSubclass extends SDL_Pixels {}
	$owned = new PixelSubclass(4,1); $owned[0] = 61;
	$destination = new SDL_Pixels(4,1);
	$subclass = SDL_ConvertPixels(1,1,SDL_PIXELFORMAT_ABGR8888,$owned,4,SDL_PIXELFORMAT_ABGR8888,$destination,4);
	foreach([$owned,new SDL_PixelFormat(SDL_PIXELFORMAT_ABGR8888),new SDL_Palette(2),surface()] as $object) {
		$reject('clone',function() use ($object) { $copy = clone $object; });
		$reject('serialize',fn() => serialize($object));
	}
	$reject('pixels-reinit',fn() => $owned->__construct(4,1));
	$reject('readonly',function() use ($owned) { $owned->pitch = 1; });
	echo json_encode(compact('alive','gone','subclass','rejected') + ['copied'=>$destination[0]]);
	`);
	expect(result).toMatchObject({alive: [true, 42, 4], gone: true, subclass: 0, copied: 61});
	expect(result.rejected).toEqual([
		'borrowed-format', 'byte', 'byte-method', 'metadata', 'count', 'exists', 'format', 'map', 'debug', 'surface-reinit'
		, 'clone', 'serialize', 'clone', 'serialize', 'clone', 'serialize', 'clone', 'serialize', 'pixels-reinit', 'readonly'
	]);
});

test('palette views follow native ownership and invalidate on replacement', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	$s = new SDL_Surface(0,2,2,8,0,0,0,0);
	$weak = WeakReference::create($s); $format = $s->format; $palette = $format->palette;
	unset($s,$format); gc_collect_cycles();
	$palette[0] = new SDL_Color(10,20,30,255);
	$alive = [$weak->get() !== null,$palette[0]->r,$palette->ncolors];
	$reject('borrowed-palette',fn() => $palette->Free());
	$replacement = new SDL_Palette(256);
	$set = SDL_SetPixelFormatPalette($weak->get()->format,$replacement);
	$reject('replaced-read',fn() => $palette[0]);
	$reject('replaced-write',function() use ($palette) { $palette[0] = new SDL_Color(0,0,0,0); });
	$live = $weak->get()->format->palette;
	$replacement->Free(); $replacement->Free();
	$live[1] = new SDL_Color(40,50,60,255); $color = $live[1]->g;
	SDL_FreeSurface($weak->get());
	$reject('dead-owner',fn() => $live->ncolors);
	unset($palette,$live); gc_collect_cycles(); $gone = $weak->get() === null;
	$owned = new SDL_Palette(2);
	$setColors = SDL_SetPaletteColors($owned,[new SDL_Color(1,2,3,4),new SDL_Color(5,6,7,8)]);
	$colors = [$owned[0]->r,$owned[1]->b];
	$reject('negative-first',fn() => SDL_SetPaletteColors($owned,[new SDL_Color(0,0,0,0)],-1));
	$reject('negative-count',fn() => SDL_SetPaletteColors($owned,[],0,-1));
	$reject('sparse',fn() => SDL_SetPaletteColors($owned,[9=>new SDL_Color(0,0,0,0)]));
	$reject('count',fn() => SDL_SetPaletteColors($owned,[],0,1));
	$owned->Free(); $reject('reinit',fn() => $owned->__construct(2));
	$format = new SDL_PixelFormat(SDL_PIXELFORMAT_ABGR8888); $format->Free(); $format->Free();
	$reject('format-reinit',fn() => $format->__construct(SDL_PIXELFORMAT_ABGR8888));
	echo json_encode(compact('alive','set','color','gone','setColors','colors','rejected'));
	`);
	expect(result).toMatchObject({alive: [true, 10, 256], set: 0, color: 50, gone: true, setColors: 0, colors: [1, 7]});
	expect(result.rejected).toEqual(['borrowed-palette', 'replaced-read', 'replaced-write', 'dead-owner', 'negative-first', 'negative-count', 'sparse', 'count', 'reinit', 'format-reinit']);
});

test('view owner cycles collect and window surface aliases invalidate on native teardown', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	class SurfaceCycle extends SDL_Surface { public $view; }
	$weak = [];
	for($i = 0; $i < 100; $i++) {
		$s = new SurfaceCycle(0,2,2,8,0,0,0,0); $s->view = $s->format->palette;
		get_object_vars($s->view); // Debug properties must not hide the retained owner from GC.
		$weak[] = WeakReference::create($s); unset($s);
	}
	gc_collect_cycles(); $remaining = count(array_filter($weak,fn($ref) => $ref->get() !== null));
	SDL_Init(SDL_INIT_VIDEO); $window = SDL_CreateWindow('Surface',0,0,32,32,SDL_WINDOW_SHOWN);
	$first = SDL_GetWindowSurface($window); $alias = SDL_GetWindowSurface($window);
	if(!$first || !$alias) { throw new RuntimeException(SDL_GetError()); }
	$pixels = $first->pixels; $format = $alias->format;
	$reject('window-owned',fn() => SDL_FreeSurface($first));
	SDL_SetWindowSize($window,48,40); $resized = SDL_GetWindowSurface($window);
	$dimensions = [$resized->w,$resized->h];
	$reject('resized-pixels',fn() => $pixels[0]);
	$reject('resized-format',fn() => $format->BytesPerPixel);
	$newPixels = $resized->pixels; SDL_DestroyWindow($window);
	$reject('destroyed-window',fn() => $newPixels[0]);
	$window = SDL_CreateWindow('Video',0,0,32,32,SDL_WINDOW_SHOWN);
	$videoPixels = SDL_GetWindowSurface($window)->pixels; SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$reject('video-quit',fn() => $videoPixels[0]); SDL_Quit();
	echo json_encode(compact('remaining','dimensions','rejected'));
	`);
	expect(result).toEqual({remaining: 0, dimensions: [48, 40], rejected: ['window-owned', 'resized-pixels', 'resized-format', 'destroyed-window', 'video-quit']});
});

test('scaled and lower blits read both rectangles and preserve output object aliases', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${surface}${rejectHelper}
	$src = surface(2,2); $dst = surface(4,4);
	SDL_SetSurfaceBlendMode($src,SDL_BLENDMODE_NONE);
	SDL_FillRect($src,null,SDL_MapRGBA($src->format,255,0,0,255));
	$results = [];
	foreach(['SDL_UpperBlit','SDL_UpperBlitScaled','SDL_LowerBlit','SDL_LowerBlitScaled','SDL_SoftStretch'] as $blit) {
		SDL_FillRect($dst,null,0); $sr = new SDL_Rect(0,0,2,2); $dr = new SDL_Rect(1,1,2,2);
		$srcAlias = $sr; $dstAlias = $dr; $status = $blit($src,$sr,$dst,$dr); $pixels = $dst->pixels;
		$results[] = [$status,$sr === $srcAlias,$dr === $dstAlias,$pixels->GetByte(4,1),$pixels->GetByte(0,0),$dr->w,$dr->h];
	}
	$sr = new SDL_Rect(0,0,2,2); $dr = new SDL_Rect(1,1,3,3);
	$reject('lower-size',function() use ($src,$dst,$sr,$dr) { SDL_LowerBlit($src,$sr,$dst,$dr); });
	$sr = new SDL_Rect(-1,0,2,2);
	$reject('lower-bounds',function() use ($src,$dst,$sr,$dr) { SDL_LowerBlitScaled($src,$sr,$dst,$dr); });
	$clip = SDL_SetClipRect($dst,new SDL_Rect(1,1,2,2)); SDL_GetClipRect($dst,$actual);
	$clipRect = [$actual->x,$actual->y,$actual->w,$actual->h]; $reset = SDL_SetClipRect($dst,null);
	$fill = SDL_FillRects($dst,[new SDL_Rect(0,0,1,1)],0,1);
	$reject('negative-count',fn() => SDL_FillRects($dst,[],-1,0));
	$reject('sparse',fn() => SDL_FillRects($dst,[2=>new SDL_Rect(0,0,1,1)],0,0));
	$reject('oversized-count',fn() => SDL_FillRects($dst,[],2147483647,0));
	SDL_FreeSurface($src); SDL_FreeSurface($dst);
	echo json_encode(compact('results','clip','clipRect','reset','fill','rejected'));
	`);
	expect(result.results).toEqual(Array.from({length: 5}, () => [0, true, true, 255, 0, 2, 2]));
	expect(result).toMatchObject({clip: true, clipRect: [1, 1, 2, 2], reset: true, fill: 0});
	expect(result.rejected).toEqual(['lower-size', 'lower-bounds', 'negative-count', 'sparse', 'oversized-count']);
});

test('RLE views require locks and live surface pixels can be uploaded', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${renderer}${surface}${rejectHelper}
	$src = surface(); $dst = surface(); $pixels = $src->pixels;
	SDL_SetSurfaceBlendMode($src,SDL_BLENDMODE_NONE); SDL_SetColorKey($src,true,0);
	SDL_FillRect($src,null,SDL_MapRGBA($src->format,17,34,51,255)); SDL_SetSurfaceRLE($src,1);
	SDL_UpperBlit($src,null,$dst); $rle = SDL_MUSTLOCK($src);
	$reject('unlocked-rle',fn() => $pixels[0]);
	$locked = SDL_LockSurface($src); $byte = $pixels[0]; $pixels[0] = 85;
	$t = texture($renderer); $uploaded = SDL_UpdateTexture($t,null,$pixels,$pixels->pitch);
	SDL_UnlockSurface($src); $reject('unlocked-again',fn() => $pixels[0]);
	SDL_LockSurface($src); $retained = $pixels[0]; SDL_UnlockSurface($src);
	SDL_RenderCopy($renderer,$t,null,new SDL_Rect(0,0,2,2));
	$readback = bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(0,0,1,1),SDL_PIXELFORMAT_ABGR8888));
	SDL_FreeSurface($src); SDL_FreeSurface($dst); SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('rle','locked','byte','uploaded','retained','readback','rejected'));
	`);
	expect(result).toEqual({rle: true, locked: 0, byte: 17, uploaded: 0, retained: 85, readback: '552233ff', rejected: ['unlocked-rle', 'unlocked-again']});
});

test('shape getters cannot leave stale surface, palette, texture or renderer pointers', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${renderer}${surface}${rejectHelper}
	$callbackRuns = 0;
	class CallbackRect extends SDL_Rect {
		public $callback;
		function __construct($callback) { parent::__construct(0,0,2,2); $this->callback = $callback; unset($this->x); }
		function __get($name) { $GLOBALS['callbackRuns']++; ($this->callback)(); return 0; }
	}
	class CallbackFRect extends SDL_FRect {
		public $callback;
		function __construct($callback) { parent::__construct(0,0,2,2); $this->callback = $callback; unset($this->x); }
		function __get($name) { $GLOBALS['callbackRuns']++; ($this->callback)(); return 0.0; }
	}
	foreach(['fill','fills','clip','blit'] as $operation) {
		$s = surface(); $d = surface(); $rect = new CallbackRect(fn() => SDL_FreeSurface($s));
		$reject($operation,function() use ($operation,$s,$d,$rect) {
			if($operation === 'fill') { SDL_FillRect($s,$rect,0); }
			elseif($operation === 'fills') { SDL_FillRects($s,[$rect],0,0); }
			elseif($operation === 'clip') { SDL_SetClipRect($s,$rect); }
			else { SDL_UpperBlit($s,$rect,$d); }
		}); SDL_FreeSurface($d);
	}
	class CallbackColor extends SDL_Color {
		public $callback;
		function __construct($callback) { parent::__construct(0,0,0,255); $this->callback = $callback; unset($this->r); }
		function __get($name) { $GLOBALS['callbackRuns']++; ($this->callback)(); return 0; }
	}
	$p = new SDL_Palette(2); $color = new CallbackColor(fn() => SDL_FreePalette($p));
	$reject('palette',fn() => SDL_SetPaletteColors($p,[$color]));
	foreach(['update','lock','copy','copy-ex','copy-f','copy-ex-f'] as $operation) {
		$t = texture($renderer); $rect = new CallbackRect(fn() => SDL_DestroyTexture($t));
		$reject($operation,function() use ($operation,$renderer,$t,$rect) {
			if($operation === 'update') { SDL_UpdateTexture($t,$rect,str_repeat('a',16),8); }
			elseif($operation === 'lock') { SDL_LockTexture($t,$rect,$pixels,$pitch); }
			elseif($operation === 'copy') { SDL_RenderCopy($renderer,$t,$rect,null); }
			elseif($operation === 'copy-ex') { SDL_RenderCopyEx($renderer,$t,$rect,null,0,null,SDL_FLIP_NONE); }
			elseif($operation === 'copy-f') { SDL_RenderCopyF($renderer,$t,$rect,null); }
			else { SDL_RenderCopyExF($renderer,$t,$rect,null,0,null,SDL_FLIP_NONE); }
		});
	}
	foreach(['fill-f','draw-f','read'] as $operation) {
		$callback = fn() => SDL_DestroyRenderer($renderer);
		$rect = $operation === 'read' ? new CallbackRect($callback) : new CallbackFRect($callback);
		$reject($operation,function() use ($renderer,$rect,$operation) {
			if($operation === 'read') { SDL_RenderReadPixels($renderer,$rect,SDL_PIXELFORMAT_ABGR8888); }
			elseif($operation === 'fill-f') { SDL_RenderFillRectF($renderer,$rect); }
			else { SDL_RenderDrawRectF($renderer,$rect); }
		});
		$renderer = SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED);
	}
	SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('rejected','callbackRuns'));
	`);
	expect(result.callbackRuns).toBe(14);
	expect(result.rejected).toEqual(['fill', 'fills', 'clip', 'blit', 'palette', 'update', 'lock', 'copy', 'copy-ex', 'copy-f', 'copy-ex-f', 'fill-f', 'draw-f', 'read']);
});

test('texture lock output callbacks fail safely without cancelling a newer lock', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${renderer}${rejectHelper}
	class OnRelease {
		public $callback;
		function __construct($callback) { $this->callback = $callback; }
		function __destruct() { ($this->callback)(); }
	}
	foreach(['pixels','pitch','throw','renderer','unlock','relock'] as $operation) {
		$t = texture($renderer);
		$callback = function() use ($operation,$t,$renderer) {
			if($operation === 'renderer') { SDL_DestroyRenderer($renderer); }
			elseif($operation === 'unlock' || $operation === 'relock') {
				SDL_UnlockTexture($t);
				if($operation === 'relock') { SDL_LockTexture($t,null,$GLOBALS['newLock'],$GLOBALS['newPitch']); }
			} else { SDL_DestroyTexture($t); }
			if($operation === 'throw') { throw new RuntimeException('original destructor error'); }
		};
		$output = $operation === 'pitch' ? null : new OnRelease($callback);
		$pitch = $operation === 'pitch' ? new OnRelease($callback) : null;
		$reject($operation,function() use ($operation,$t,&$output,&$pitch) {
			try { SDL_LockTexture($t,null,$output,$pitch); }
			catch(Throwable $error) {
				if($operation === 'throw') { $GLOBALS['destructorMessage'] = $error->getMessage(); }
				throw $error;
			}
		});
		if($operation === 'unlock' || $operation === 'relock') {
			if($operation === 'relock') { $GLOBALS['newLock'][0] = 91; SDL_UnlockTexture($t); $kept = $GLOBALS['newLock'][0]; }
			SDL_DestroyTexture($t);
		}
		if($operation === 'renderer') { $renderer = SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED); }
	}
	class TypedOutputs { public int $pixels = 0; public array $pitch = []; }
	$typed = new TypedOutputs; $t = texture($renderer);
	$reject('pixels-type',function() use ($t,$typed) { SDL_LockTexture($t,null,$typed->pixels,$pitch); });
	$reject('pitch-type',function() use ($t,$typed) { SDL_LockTexture($t,null,$pixels,$typed->pitch); });
	$next = SDL_LockTexture($t,null,$pixels,$pitch); SDL_UnlockTexture($t);
	SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('kept','next','rejected') + ['message'=>$GLOBALS['destructorMessage']]);
	`);
	expect(result).toEqual({kept: 91, next: 0, message: 'original destructor error', rejected: ['pixels', 'pitch', 'throw', 'renderer', 'unlock', 'relock', 'pixels-type', 'pitch-type']});
});

test('native query outputs respect typed references and destructor exceptions', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${renderer}${surface}${rejectHelper}
	class TypedQuery { public array $wrong = []; public int $number = 0; }
	$holder = new TypedQuery; $s = surface(); $format = $s->format; $t = texture($renderer);
	SDL_SetColorKey($s,true,123);
	foreach(['SDL_GetSurfaceAlphaMod','SDL_GetSurfaceBlendMode','SDL_GetColorKey','SDL_GetClipRect'] as $query) {
		$reject($query,function() use ($s,$holder,$query) { $query($s,$holder->wrong); });
	}
	$reject('color',function() use ($s,$holder) { SDL_GetSurfaceColorMod($s,$holder->wrong,$g,$b); });
	$reject('rgba',function() use ($format,$holder) { SDL_GetRGBA(0,$format,$holder->wrong,$g,$b,$a); });
	$reject('method-rgb',function() use ($format,$holder) { $format->GetRGB(0,$holder->wrong,$g,$b); });
	$reject('masks',function() use ($holder) { SDL_PixelFormatEnumToMasks(SDL_PIXELFORMAT_ABGR8888,$holder->wrong,$r,$g,$b,$a); });
	$reject('query',function() use ($t,$holder) { SDL_QueryTexture($t,$holder->wrong,$access,$w,$h); });
	$reject('output-size',function() use ($renderer,$holder) { SDL_GetRendererOutputSize($renderer,$holder->wrong,$h); });
	$reject('gamma',function() use ($holder) { SDL_CalculateGammaRamp(1.0,$holder->number); });
	class QueryRelease { function __destruct() { throw new RuntimeException('query output'); } }
	$out = new QueryRelease; $g = 99; $b = 99;
	$reject('destructor',function() use ($format,&$out,&$g,&$b) { SDL_GetRGB(0,$format,$out,$g,$b); });
	SDL_GetSurfaceAlphaMod($s,$holder->number); $alpha = $holder->number;
	SDL_FreeSurface($s); SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('alpha','g','b','rejected'));
	`);
	expect(result).toEqual({alpha: 255, g: 99, b: 99, rejected: ['SDL_GetSurfaceAlphaMod', 'SDL_GetSurfaceBlendMode', 'SDL_GetColorKey', 'SDL_GetClipRect', 'color', 'rgba', 'method-rgb', 'masks', 'query', 'output-size', 'gamma', 'destructor']});
});


test('integer and float renderer shapes produce pixels and reject invalid values', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${renderer}${rejectHelper}
	$t = texture($renderer); SDL_UpdateTexture($t,null,str_repeat("\xff\x00\x00\xff",4),8);
	$results = [];
	foreach(['copy','copy-ex','copy-f','copy-ex-f'] as $operation) {
		SDL_SetRenderDrawColor($renderer,0,0,0,255); SDL_RenderClear($renderer);
		$dst = new SDL_Rect(2,3,4,4); $floatDst = new SDL_FRect(2,3,4,4);
		if($operation === 'copy') { $status = SDL_RenderCopy($renderer,$t,null,$dst); }
		elseif($operation === 'copy-ex') { $status = SDL_RenderCopyEx($renderer,$t,null,$dst,0,new SDL_Point(2,2),SDL_FLIP_NONE); }
		elseif($operation === 'copy-f') { $status = SDL_RenderCopyF($renderer,$t,null,$floatDst); }
		else { $status = SDL_RenderCopyExF($renderer,$t,null,$floatDst,0,new SDL_FPoint(2,2),SDL_FLIP_NONE); }
		$results[] = [$status,bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(2,3,1,1),SDL_PIXELFORMAT_ABGR8888))];
	}
	SDL_SetRenderDrawColor($renderer,0,255,0,255);
	$draws = [SDL_RenderFillRect($renderer,new SDL_Rect(0,0,2,2)), SDL_RenderDrawRect($renderer,new SDL_Rect(0,0,2,2)),
		SDL_RenderFillRectF($renderer,new SDL_FRect(4,4,2,2)), SDL_RenderDrawRectF($renderer,new SDL_FRect(4,4,2,2))];
	$green = bin2hex(SDL_RenderReadPixels($renderer,new SDL_Rect(4,4,1,1),SDL_PIXELFORMAT_ABGR8888));
	$rect = new SDL_Rect(0,0,1,1); $rect->x = '1';
	$coerced = [SDL_RenderFillRect($renderer,$rect),$rect->x];
	$frect = new SDL_FRect(0,0,1,1); $frect->x = INF;
	$reject('infinite-field',fn() => SDL_RenderFillRectF($renderer,$frect));
	$frect->x = 1e100; $reject('float-overflow',fn() => SDL_RenderDrawRectF($renderer,$frect));
	$frect->x = NAN; $reject('nan',fn() => SDL_RenderCopyF($renderer,$t,null,$frect));
	SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('results','draws','green','coerced','rejected'));
	`);
	expect(result).toEqual({results: Array.from({length: 4}, () => [0, 'ff0000ff']), draws: [0, 0, 0, 0], green: '00ff00ff', coerced: [0, 1], rejected: ['infinite-field', 'float-overflow', 'nan']});
});
