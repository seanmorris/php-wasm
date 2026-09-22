import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const setup = String.raw`
if(SDL_Init(SDL_INIT_VIDEO) !== 0) { throw new RuntimeException(SDL_GetError()); }
$window = SDL_CreateWindow('Cursor tests',0,0,64,64,SDL_WINDOW_SHOWN);
if(!$window) { throw new RuntimeException(SDL_GetError()); }
$data = str_repeat("\xff",8);
`;

/**
 * Move the browser pointer onto the canvas and read the backend's selected cursor.
 * SDL updates cursor CSS only while a window has mouse focus.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<string>} Selected CSS cursor.
 */
const cursorCss = async page => {
	await page.locator('canvas').hover();
	return page.locator('canvas').evaluate(canvas => canvas.style.cursor);
};

test('pre-video cursors cannot leave a freed current cursor behind', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${rejectHelper}
	$data=str_repeat("\xff",8); $cursor=new SDL_Cursor($data,$data,8,8,0,0);
	$reject('select',fn() => SDL_SetCursor($cursor));
	$reject('redraw',fn() => SDL_SetCursor(null));
	SDL_FreeCursor($cursor);
	echo json_encode([SDL_GetCursor(),SDL_GetDefaultCursor(),$rejected]);
	`)).toEqual([null, null, ['select', 'redraw']]);
});

test('bitmap constructors and color cursors control the canvas and preserve subclass properties', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${setup}
	class GameCursor extends SDL_Cursor { public string $marker = 'intact'; }
	$cursor = new GameCursor($data,$data,8,8,0,0);
	$cursor->Set(); $same = SDL_GetCursor() === $cursor;
	echo json_encode(['same'=>$same,'marker'=>$cursor->marker]);
	`)).toEqual({same: true, marker: 'intact'});
	await page.locator('canvas').hover();
	expect(await cursorCss(page)).toMatch(/^url\(["']?data:image\/png;base64,/);
	expect(await run(page, String.raw`
	$surface = new SDL_Surface(0,2,2,32,0xff,0xff00,0xff0000,-16777216);
	SDL_FillRect($surface,null,SDL_MapRGBA($surface->format,230,180,90,255));
	$color = SDL_Cursor::CreateColor($surface,1,1); SDL_FreeSurface($surface);
	$color->Set(); $same = SDL_Cursor::Get() === $color;
	$cursor->Free(); $cursor->Free();
	echo json_encode($same);
	`)).toBe(true);
	expect(await cursorCss(page)).toMatch(/^url\(["']?data:image\/png;base64,/);
	expect(await run(page, String.raw`
	$system = SDL_Cursor::CreateSystem(SDL_SYSTEM_CURSOR_HAND);
	class CursorCaller {
		function select($cursor) { SDL_SetCursor($cursor); SDL_SetCursor(null); }
		function release($cursor) { SDL_FreeCursor($cursor); }
	}
	$caller = new CursorCaller; $caller->select($system); $caller->release($color);
	echo json_encode(SDL_GetCursor() === $system);
	`)).toBe(true);
	expect(await cursorCss(page)).toBe('pointer');
});

test('cursor aliases retain their owner and explicit free invalidates every alias', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${setup}${rejectHelper}
	$cursor = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_CROSSHAIR);
	SDL_SetCursor($cursor); $alias = SDL_GetCursor(); $weak = WeakReference::create($cursor);
	$same = $cursor === $alias; unset($cursor); gc_collect_cycles();
	$retained = $weak->get() === $alias;
	SDL_SetCursor($alias); SDL_FreeCursor($alias); SDL_FreeCursor($alias);
	$reject('alias',fn() => $alias->Set());
	$default = SDL_GetDefaultCursor(); $reset = SDL_GetCursor() === $default;
	unset($alias); gc_collect_cycles(); $released = $weak->get() === null;
	SDL_FreeCursor($default); $default->Set(); $defaultSafe = SDL_GetCursor() === $default;
	echo json_encode(compact('same','retained','reset','released','defaultSafe','rejected'));
	`)).toEqual({same: true, retained: true, reset: true, released: true, defaultSafe: true, rejected: ['alias']});
	expect(await cursorCss(page)).toBe('default');
});

test('cursor visibility queries leave the current visibility unchanged', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	$hide = SDL_ShowCursor(SDL_DISABLE);
	$query = [SDL_ShowCursor(SDL_QUERY),SDL_Cursor::Show(SDL_QUERY)];
	echo json_encode(compact('hide','query'));
	`)).toEqual({hide: 1, query: [0, 0]});
	expect(await cursorCss(page)).toBe('none');
	expect(await run(page, `${rejectHelper}
	$show = SDL_ShowCursor(SDL_ENABLE); $query = SDL_ShowCursor(SDL_QUERY);
	$reject('negative',fn() => SDL_ShowCursor(-2));
	$reject('positive',fn() => SDL_ShowCursor(2));
	echo json_encode(compact('show','query','rejected'));
	`)).toEqual({show: 0, query: 1, rejected: ['negative', 'positive']});
	expect(await cursorCss(page)).toBe('default');
});

test('cursor dimensions, hotspots, ownership copying and reinitialization are checked', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	foreach([[0,8],[7,8],[8,0],[-8,8],[2147483640,8],[8,2147483647]] as [$w,$h]) {
		$reject('size',fn() => SDL_CreateCursor($data,$data,$w,$h,0,0));
	}
	$reject('data',fn() => SDL_CreateCursor('',$data,8,8,0,0));
	$reject('mask',fn() => new SDL_Cursor($data,'',8,8,0,0));
	foreach([[-1,0],[8,0],[0,8]] as [$x,$y]) {
		$reject('hotspot',fn() => SDL_CreateCursor($data,$data,8,8,$x,$y));
	}
	foreach([-1,SDL_NUM_SYSTEM_CURSORS] as $id) { $reject('system',fn() => SDL_CreateSystemCursor($id)); }
	$cursor = SDL_CreateCursor($data,$data,8,8,0,0);
	$reject('clone',fn() => clone $cursor);
	$reject('serialize',fn() => serialize($cursor));
	$reject('unserialize',fn() => unserialize('O:10:"SDL_Cursor":0:{}'));
	$reject('reinit',fn() => $cursor->__construct($data,$data,8,8,0,0));
	$cursor->Free(); $reject('closed-reinit',fn() => $cursor->__construct($data,$data,8,8,0,0));
	$surface = new SDL_Surface(0,2,2,32,0xff,0xff00,0xff0000,-16777216);
	$reject('color-hotspot',fn() => SDL_CreateColorCursor($surface,2,0));
	SDL_FreeSurface($surface); $reject('color-freed',fn() => SDL_CreateColorCursor($surface,0,0));
	echo json_encode($rejected);
	`);
	expect(result).toEqual([...Array(6).fill('size'), 'data', 'mask', ...Array(3).fill('hotspot'), 'system', 'system', 'clone', 'serialize', 'unserialize', 'reinit', 'closed-reinit', 'color-hotspot', 'color-freed']);
});

test('cursor constructor reentry preserves the successfully initialized cursor', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${setup}${rejectHelper}
	class DeferredCursor extends SDL_Cursor {
		function __construct() {}
		function initialize($data,$mask) { parent::__construct($data,$mask,8,8,0,0); }
	}
	$cursor = new DeferredCursor;
	$argument = new class($cursor,$data) {
		function __construct(public $cursor,public $data) {}
		function __toString() { $this->cursor->initialize($this->data,$this->data); return $this->data; }
	};
	$reject('reentry',fn() => $cursor->initialize($argument,$data));
	$cursor->Set(); $same = SDL_GetCursor() === $cursor; $cursor->Free();
	echo json_encode(compact('same','rejected'));
	`)).toEqual({same: true, rejected: ['reentry']});
});

test('video reference counts, quit and reinitialization invalidate cursors at native teardown', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${setup}${rejectHelper}
	SDL_InitSubSystem(SDL_INIT_VIDEO);
	$cursor = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_HAND); $cursor->Set();
	$default = SDL_GetDefaultCursor(); SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$cursor->Set(); $intermediate = SDL_GetCursor() === $cursor;
	SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$reject('final',fn() => $cursor->Set()); $reject('default',fn() => $default->Set());
	$cursor->Free(); $default->Free();
	SDL_InitSubSystem(SDL_INIT_VIDEO); $new = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_IBEAM);
	$new->Set(); SDL_VideoInit();
	$reject('reinit',fn() => $new->Set()); $new->Free();
	$last = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_WAIT); SDL_Quit();
	$reject('quit',fn() => $last->Set()); $last->Free();
	echo json_encode(compact('intermediate','rejected'));
	`)).toEqual({intermediate: true, rejected: ['final', 'default', 'reinit', 'quit']});
});

test('mouse state outputs honor typed references and preserve destructor exceptions', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${setup}${rejectHelper}
	class MouseOutput { public array $value = []; }
	class MouseDestructor { function __destruct() { SDL_Quit(); throw new RuntimeException('mouse output destructor'); } }
	$typed = new MouseOutput; $results = []; $messages = [];
	foreach(['SDL_GetMouseState','SDL_GetRelativeMouseState'] as $query) {
		SDL_InitSubSystem(SDL_INIT_VIDEO);
		$y = 'untouched'; $reject('typed',function() use ($query,$typed,&$y) { $query($typed->value,$y); });
		$results[] = $y; $x = new MouseDestructor; $y = 'untouched';
		try { $query($x,$y); } catch(Throwable $error) { $messages[] = $error->getMessage(); }
		$results[] = $y;
	}
	echo json_encode(compact('rejected','results','messages'));
	`)).toEqual({rejected: ['typed', 'typed'], results: Array(4).fill('untouched'), messages: Array(2).fill('mouse output destructor')});
});

test('cursor last references and property cycles release native allocations', async ({page}) => {
	await start(page);
	await run(page, `${setup}
	class CyclicCursor extends SDL_Cursor { public $cycle; }
	$warm = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_HAND); $warm->Set(); unset($warm);
	`);
	const baseline = await allocationStats(page);
	const result = await run(page, String.raw`
	$refs = [];
	for($i = 0; $i < 150; $i++) {
		$cursor = new CyclicCursor($data,$data,8,8,0,0); $cursor->cycle = $cursor;
		$refs[] = WeakReference::create($cursor); $cursor->Set(); unset($cursor);
		$system = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_HAND); $system->Set(); unset($system);
		gc_collect_cycles();
	}
	$live = count(array_filter($refs,fn($ref) => $ref->get() !== null));
	unset($refs); gc_collect_cycles(); echo json_encode($live);
	`);
	expect(result).toBe(0);
	const after = await allocationStats(page);
	// SDL 2.32.10's Emscripten custom cursor allocates its URL with raw _malloc
	// but releases it with SDL_free, undercounting by one per freed bitmap.
	// The preserved-runtime probe confirms that drift while live heap stays flat.
	expect(after.sdlAllocations + 150).toBe(baseline.sdlAllocations);
	expect(after.liveBytes - baseline.liveBytes).toBeLessThan(65536);
	expect(await cursorCss(page)).toBe('default');
});

test('mouse position queries receive browser events and warping reports backend limitations', async ({page}) => {
	await start(page);
	await run(page, setup);
	const bounds = await page.locator('canvas').boundingBox();
	await page.mouse.move(bounds.x + 30, bounds.y + 20);
	expect(await run(page, `SDL_PumpEvents(); $buttons = SDL_GetMouseState($x,$y); echo json_encode([$buttons,$x,$y]);`)).toEqual([0, 30, 20]);
	await run(page, 'SDL_GetRelativeMouseState($x,$y);');
	await page.mouse.move(bounds.x + 33, bounds.y + 24);
	expect(await run(page, 'SDL_GetRelativeMouseState($x,$y); SDL_GetRelativeMouseState($nextX,$nextY); echo json_encode([$x,$y,$nextX,$nextY]);')).toEqual([3, 4, 0, 0]);
	const result = await run(page, `${rejectHelper}
	SDL_ClearError(); $window->WarpMouse(1,2); $warpError = SDL_GetError();
	SDL_WarpMouseInWindow(null,1,2); SDL_DestroyWindow($window);
	$reject('dead-window',fn() => SDL_WarpMouseInWindow($window,1,2));
	echo json_encode(compact('warpError','rejected'));
	`);
	expect(result.warpError).toMatch(/not supported/i);
	expect(result.rejected).toEqual(['dead-window']);
});

test('native creation results and repeated PHP refreshes leave usable cursor state', async ({page}) => {
	await start(page);
	expect(await run(page, String.raw`${rejectHelper}
	$data = str_repeat("\xff",8);
	$failed = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_HAND);
	$software = new SDL_Cursor($data,$data,8,8,0,0); $created = $software instanceof SDL_Cursor;
	$software->Free(); $reject('freed-software',fn() => $software->Set());
	echo json_encode(compact('failed','created','rejected'));
	`)).toEqual({failed: null, created: true, rejected: ['freed-software']});
	for(let request = 0; request < 3; request++)
	{
		await run(page, `${setup}
		$cursor = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_HAND); $cursor->Set();
		$default = SDL_GetDefaultCursor(); $default->Free();
		if(SDL_GetCursor() !== $cursor) { throw new RuntimeException('freeing default replaced the active cursor'); }
		`);
		expect(await cursorCss(page)).toBe('pointer');
		await page.evaluate(() => window.bindingPhp.refresh());
		expect(await run(page, 'echo json_encode(SDL_GetCursor() === SDL_GetDefaultCursor());')).toBe(true);
	}
	await run(page, 'SDL_Quit();');
});


test('video initialization frees cursors created before a video driver exists', async ({page}) => {
	await start(page);
	const before = await allocationStats(page);
	await run(page, String.raw`${rejectHelper}
	$data = str_repeat("\xff",8); $software = [];
	for($i = 0; $i < 20; $i++) { $software[] = new SDL_Cursor($data,$data,8,8,0,0); }
	SDL_VideoInit();
	$reject('invalidated',fn() => $software[0]->Set());
	if($rejected !== ['invalidated']) { throw new RuntimeException('old video cursor is still usable'); }
	SDL_VideoQuit(); SDL_Quit(); unset($software); gc_collect_cycles();
	`);
	const after = await allocationStats(page);
	expect(after.sdlAllocations).toBe(before.sdlAllocations);
});

test('SDL mouse callbacks use the supplied canvas despite another canvas named canvas', async ({page}) => {
	await start(page);
	await page.evaluate(() => {
		document.querySelector('canvas').id = 'selected-sdl';
		const other = document.createElement('canvas');
		other.id = 'canvas'; document.body.append(other);
	});
	await run(page, setup);
	const selected = page.locator('#selected-sdl');
	const bounds = await selected.boundingBox();
	await page.mouse.move(bounds.x + 18, bounds.y + 25);
	expect(await run(page, 'SDL_GetMouseState($x,$y); echo json_encode([$x,$y]);')).toEqual([18, 25]);
	expect(await selected.getAttribute('id')).toBe('selected-sdl');
});

test('SDL mouse callbacks work for a supplied canvas inside a shadow root', async ({page}) => {
	await start(page);
	await page.evaluate(() => {
		const canvas = document.querySelector('canvas');
		const host = document.createElement('div'); document.body.append(host);
		host.attachShadow({mode: 'open'}).append(canvas);
	});
	await run(page, setup);
	const bounds = await page.locator('canvas').boundingBox();
	await page.mouse.move(bounds.x + 12, bounds.y + 17);
	expect(await run(page, 'SDL_GetMouseState($x,$y); echo json_encode([$x,$y]);')).toEqual([12, 17]);
});
