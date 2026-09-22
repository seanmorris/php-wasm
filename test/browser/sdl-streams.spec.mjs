import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const customStream = String.raw`
class SdlTestStream {
	public $context;
	public int $position = 0;
	public string $data = 'abcdef';
	public static $hook = null;
	public static int $closed = 0;
	public static string $written = '';
	private function callback() {
		$hook = self::$hook; self::$hook = null;
		if($hook) { $hook(); }
	}
	public function stream_open($path,$mode,$options,&$opened) { return true; }
	public function stream_read($count) {
		$this->callback(); $data = substr($this->data,$this->position,$count);
		$this->position += strlen($data); return $data;
	}
	public function stream_write($data) {
		$this->callback(); self::$written .= $data;
		$this->position += strlen($data); return strlen($data);
	}
	public function stream_seek($offset,$origin) {
		$this->position = ($origin === SEEK_SET ? 0 : ($origin === SEEK_CUR ? $this->position : strlen($this->data))) + $offset;
		return $this->position >= 0;
	}
	public function stream_tell() { return $this->position; }
	public function stream_stat() { return ['size'=>strlen($this->data)]; }
	public function stream_eof() { return $this->position >= strlen($this->data); }
	public function stream_close() { self::$closed++; }
}
stream_wrapper_register('sdltest', SdlTestStream::class);
`;

const surface = String.raw`
function surface() {
	$s = new SDL_Surface(0,2,2,32,0xff,0xff00,0xff0000,-16777216);
	SDL_FillRect($s,null,SDL_MapRGBA($s->format,10,20,30,255));
	return $s;
}
`;

test('raw RWops fail safely and closed wrappers cannot be cloned or reinitialized', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	class RawStream extends SDL_RWops { public string $marker = 'intact'; }
	foreach([new SDL_RWops,SDL_AllocRW(),new RawStream] as $rw) {
		$reject('tell',fn() => $rw->Tell());
		$reject('read',function() use ($rw) { $rw->Read($out,4); });
		$reject('clone',fn() => clone $rw);
		$reject('serialize',fn() => serialize($rw));
		$rw->Free(); $rw->Close();
		$reject('closed',fn() => SDL_RWsize($rw));
		$reject('reinit',fn() => $rw->__construct());
	}
	$marker = $rw->marker;
	for($i = 0; $i < 100; $i++) { $raw = new SDL_RWops; unset($raw); }
	echo json_encode(compact('marker','rejected'));
	`);
	expect(result.marker).toBe('intact');
	expect(result.rejected).toEqual(Array(3).fill(['tell', 'read', 'clone', 'serialize', 'closed', 'reinit']).flat());
});

test('memory RWops preserve PHP copy-on-write and validate sizes and typed outputs', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	$buf = 'abc'; $before = $buf;
	$rw = SDL_RWFromMem($buf,5); $created = bin2hex($buf); $after = $buf;
	$write = $rw->Write('Z'); $changed = bin2hex($buf);
	$rw->Seek(1,RW_SEEK_SET); $endian = $rw->WriteBE16(0x1234);
	$rw->Seek(0,RW_SEEK_SET); $read = $rw->Read($bytes,1,5); $roundtrip = bin2hex($bytes);
	$eof = $rw->Read($bytes,1); $eofOutput = $bytes;
	$rw->Seek(0,RW_SEEK_SET); $zero = [$rw->Read($bytes,2,0),$bytes,$rw->Write('xy',2,0),$rw->Tell()];
	$buf[0] = 'Q'; $fromPhp = $rw->ReadU8();
	$buf = 'bad'; $reject('capacity',fn() => $rw->Tell()); $buf = 'abcde';
	foreach([[-1,1],[1,-1],[2147483647,2]] as [$size,$count]) {
		$reject('range',function() use ($rw,$size,$count) { $rw->Read($out,$size,$count); });
	}
	$reject('short-write',fn() => $rw->Write('x',2,2));
	$reject('origin',fn() => $rw->Seek(0,99));
	$reject('const-size',fn() => SDL_RWFromConstMem('x',2));
	$reject('zero-capacity',function() { $s = ''; SDL_RWFromMem($s,0); });
	class TypedOutput { public array $value = []; }
	$typed = new TypedOutput;
	$reject('typed-output',function() use ($rw,$typed) { $rw->Read($typed->value,1); });
	$rw->Close(); $rw->Free();
	$const = SDL_RWFromConstMem("\xff\xff\xff\xff"); $unsigned = $const->ReadLE32();
	$const->Close();
	echo json_encode(compact('before','created','after','write','changed','endian','read','roundtrip','eof','eofOutput','zero','fromPhp','unsigned','rejected'));
	`);
	expect(result).toMatchObject({before: 'abc', created: '6162630000', after: 'abc\0\0', write: 1, changed: '5a62630000', endian: 1, read: 5, roundtrip: '5a12340000', eof: 0, eofOutput: '', zero: [0, '', 0, 0], fromPhp: 81, unsigned: '4294967295'});
	expect(result.rejected).toEqual(['capacity', 'range', 'range', 'range', 'short-write', 'origin', 'const-size', 'zero-capacity', 'typed-output']);
});

test('PHP file, memory and temporary streams retain owners and honor autoclose', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	$results = [];
	foreach(['php://memory','php://temp','/tmp/sdl-rwops-test.bin'] as $path) {
		$fp = fopen($path,'w+b'); fwrite($fp,'abcdef'); rewind($fp);
		$rw = SDL_RWFromFP($fp,false); $size = $rw->Size(); $count = $rw->Read($bytes,2,2);
		$position = $rw->Tell(); $rw->Seek(-2,RW_SEEK_END); $rw->Write('XY'); $rw->Close();
		rewind($fp); $results[] = [$size,$count,$bytes,$position,stream_get_contents($fp),is_resource($fp)]; fclose($fp);
	}
	$fp = fopen('php://memory','w+b'); $rw = SDL_RWFromFP($fp,true); $alias = $rw;
	$rw->Close(); $autoclosed = !is_resource($fp); $alias->Close();
	$reject('alias',fn() => $alias->Size());
	$fp = fopen('php://memory','w+b'); fwrite($fp,'retained'); rewind($fp);
	$rw = SDL_RWFromFP($fp); unset($fp); gc_collect_cycles(); $rw->Read($retained,8); $rw->Close();
	$fp = fopen('php://memory','w+b'); $rw = SDL_RWFromFP($fp); fclose($fp);
	$reject('external-close',fn() => $rw->Size()); $rw->Close();
	unlink('/tmp/sdl-rwops-test.bin');
	echo json_encode(compact('results','autoclosed','retained','rejected'));
	`);
	expect(result).toEqual({results: Array(3).fill([6, 2, 'abcd', 4, 'abcdXY', true]), autoclosed: true, retained: 'retained', rejected: ['alias', 'external-close']});
});

test('stream callbacks reject recursive close and survive fclose and pclose', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${customStream}${rejectHelper}
	$fp = fopen('sdltest://normal','r+b'); $rw = SDL_RWFromFP($fp,true);
	$size = $rw->Size(); $rw->Read($normal,3); $rw->Close();
	$messages = [];
	foreach(['recursive','fclose','pclose','other-wrapper'] as $action) {
		$fp = fopen('sdltest://callback','r+b'); $rw = SDL_RWFromFP($fp,true);
		$other = SDL_RWFromFP($fp,true);
		SdlTestStream::$hook = function() use ($action,$fp,$rw,$other) {
			if($action === 'recursive') { $rw->Close(); }
			if($action === 'fclose') { fclose($fp); }
			if($action === 'pclose') { pclose($fp); }
			if($action === 'other-wrapper') { $other->Close(); }
		};
		set_error_handler(function() { throw new RuntimeException('fclose guarded'); });
		try { $rw->Read($bytes,3); $messages[] = 'missed'; }
		catch(Throwable $error) { $messages[] = $error->getMessage(); }
		finally { restore_error_handler(); $other->Close(); $rw->Close(); }
	}
	$closed = SdlTestStream::$closed;
	echo json_encode(compact('size','normal','messages','closed'));
	`);
	expect(result).toMatchObject({size: 6, normal: 'abc', closed: 5});
	expect(result.messages[0]).toContain('during stream I/O');
	expect(result.messages[1]).toBe('fclose guarded');
	expect(result.messages.slice(2)).toEqual(Array(2).fill('PHP stream was closed during SDL I/O'));
});

test('BMP loaders close aliases and snapshot pixels across destructive stream callbacks', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${surface}${customStream}${rejectHelper}
	$s = surface(); $fp = fopen('php://memory','w+b'); $rw = SDL_RWFromFP($fp); $alias = $rw;
	$saved = SDL_SaveBMP_RW($s,$rw,1); $reject('saved-alias',fn() => $alias->Tell());
	rewind($fp); $bmp = stream_get_contents($fp); fclose($fp);
	$source = SDL_RWFromConstMem($bmp); $alias = $source;
	$loaded = SDL_LoadBMP_RW($source,1); $dimensions = [$loaded->w,$loaded->h];
	$reject('loaded-alias',fn() => $alias->Tell());
	$buffer = str_repeat("\0",1024); $memory = SDL_RWFromMem($buffer,1024);
	$memoryStatus = SDL_SaveBMP_RW($s,$memory,0); $memoryHeader = substr($buffer,0,2); $memory->Close();
	$fp = fopen('sdltest://bmp','w+b'); $destination = SDL_RWFromFP($fp,true);
	SdlTestStream::$hook = function() use ($s) { SDL_FreeSurface($s); };
	$callbackStatus = SDL_SaveBMP_RW($s,$destination,1);
	$callbackHeader = substr(SdlTestStream::$written,0,2);
	SDL_FreeSurface($loaded);
	echo json_encode(compact('saved','dimensions','memoryStatus','memoryHeader','callbackStatus','callbackHeader','rejected'));
	`);
	expect(result).toEqual({saved: 0, dimensions: [2, 2], memoryStatus: 0, memoryHeader: 'BM', callbackStatus: 0, callbackHeader: 'BM', rejected: ['saved-alias', 'loaded-alias']});
});

test('RWops output destructors and owner cycles release safely', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	class CloseOnOutput {
		public $rw;
		function __destruct() { $this->rw->Close(); throw new RuntimeException('original output error'); }
	}
	$rw = SDL_RWFromConstMem('abc'); $output = new CloseOnOutput; $output->rw = $rw;
	try { $rw->Read($output,3); $message = 'missed'; }
	catch(Throwable $error) { $message = $error->getMessage(); }
	$reject('closed-output',fn() => $rw->Tell());
	$refs = [];
	for($i = 0; $i < 100; $i++) {
		$buffer = 'abc'; $rw = SDL_RWFromMem($buffer,3); $refs[] = WeakReference::create($rw);
		$buffer = $rw; unset($buffer,$rw);
	}
	gc_collect_cycles(); $remaining = count(array_filter($refs,fn($ref) => $ref->get() !== null));
	echo json_encode(compact('message','remaining','rejected'));
	`);
	expect(result).toEqual({message: 'original output error', remaining: 0, rejected: ['closed-output']});
});

test('fonts follow initialization counts, ordinary ownership and final shutdown', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	TTF_Init(); TTF_Init(); $font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12);
	$alias = $font; TTF_Quit(); $initialized = TTF_WasInit(); $height = TTF_FontHeight($font);
	$reject('clone',fn() => clone $font); $reject('serialize',fn() => serialize($font));
	TTF_Quit(); $reject('final-quit',fn() => TTF_FontHeight($alias));
	TTF_CloseFont($font); TTF_Quit();
	TTF_Init(); $refs = [];
	for($i = 0; $i < 50; $i++) {
		$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12);
		$refs[] = WeakReference::create($font); unset($font);
	}
	gc_collect_cycles(); $remaining = count(array_filter($refs,fn($ref) => $ref->get() !== null)); TTF_Quit();
	echo json_encode(compact('initialized','height','remaining','rejected'));
	`);
	expect(result.initialized).toBe(1);
	expect(result.height).toBeGreaterThan(0);
	expect(result.remaining).toBe(0);
	expect(result.rejected).toEqual(['clone', 'serialize', 'final-quit']);
});

test('font color callbacks revalidate the font and output errors stop later assignments', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${rejectHelper}
	TTF_Init();
	class ClosingColor extends SDL_Color {
		public $font;
		function __construct($font) { parent::__construct(1,2,3,255); $this->font = $font; unset($this->r); }
		function __get($name) { TTF_CloseFont($this->font); return 255; }
	}
	foreach(['TTF_RenderText_Blended','TTF_RenderUTF8_Blended','TTF_RenderUTF8_Shaded_Wrapped'] as $call) {
		$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12); $color = new ClosingColor($font);
		$args = [$font,'hello',$color];
		if($call === 'TTF_RenderUTF8_Shaded_Wrapped') { $args[] = new SDL_Color(0,0,0,255); $args[] = 100; }
		$reject($call,fn() => $call(...$args));
	}
	$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12);
	class ThrowOnMetrics { function __destruct() { throw new RuntimeException('metrics output'); } }
	$width = new ThrowOnMetrics; $height = 777;
	try { TTF_SizeUTF8($font,'x',$width,$height); $message = 'missed'; }
	catch(Throwable $error) { $message = $error->getMessage(); }
	$reject('nul-text',fn() => TTF_RenderText_Blended($font,"a\0b",new SDL_Color(1,2,3,255)));
	TTF_Quit(); echo json_encode(compact('message','height','rejected'));
	`);
	expect(result).toEqual({message: 'metrics output', height: 777, rejected: ['TTF_RenderText_Blended', 'TTF_RenderUTF8_Blended', 'TTF_RenderUTF8_Shaded_Wrapped', 'nul-text']});
});

test('font and RWops churn returns native allocations and live heap memory to baseline', async ({page}) => {
	await start(page);
	await run(page, String.raw`
	TTF_Init();
	function churnSdlStreams() {
		for($i = 0; $i < 50; $i++) {
			$font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',12);
			if(!$font) { throw new RuntimeException(SDL_GetError()); }
			$buffer = str_repeat('x',65536); $rw = SDL_RWFromMem($buffer,65536);
			$rw->Read($read,65536); $rw->Close();
			unset($font,$rw,$buffer,$read);
		}
		gc_collect_cycles();
	}
	churnSdlStreams();
	`);
	const before = await allocationStats(page);
	expect(before.sdlAllocations).toBeGreaterThanOrEqual(0);
	expect(before.liveBytes).toBeGreaterThan(0);
	const usage = [];
	for(let round = 0; round < 4; round++)
	{
		await run(page, 'churnSdlStreams();');
		const after = await allocationStats(page);
		usage.push(after.liveBytes);
		expect(after.sdlAllocations).toBe(before.sdlAllocations);
	}
	// Permit small bookkeeping changes; a single leaked 64 KiB read exceeds this.
	expect(Math.max(...usage) - Math.min(...usage)).toBeLessThan(32768);
	await run(page, 'TTF_Quit();');
});

test('mixer loaders retain snapshots, close PHP stream aliases and preserve callback errors', async ({page}) => {
	await start(page);
	await page.locator('canvas').click();
	const result = await run(page, String.raw`${customStream}${rejectHelper}
	SDL_Init(SDL_INIT_AUDIO);
	if(Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024) !== 0) { throw new RuntimeException(SDL_GetError()); }
	$fp = fopen('php://memory','w+b'); fwrite($fp,file_get_contents('/preload/sdl/click.wav')); rewind($fp);
	$rw = SDL_RWFromFP($fp,true); $alias = $rw; $chunk = Mix_LoadWAV_RW($rw,1);
	$chunkLoaded = $chunk instanceof Mix_Chunk; $chunkClosed = !is_resource($fp);
	$reject('chunk-input',fn() => $alias->Tell()); Mix_FreeChunk($chunk);
	$fp = fopen('php://memory','w+b'); fwrite($fp,file_get_contents('/preload/sdl/loop.ogg')); rewind($fp);
	$rw = SDL_RWFromFP($fp,true); $alias = $rw; $music = Mix_LoadMUS_RW($rw,1);
	$musicLoaded = $music instanceof Mix_Music; $musicClosed = !is_resource($fp);
	$reject('music-input',fn() => $alias->Tell()); Mix_FreeMusic($music);
	$messages = [];
	foreach(['Mix_LoadWAV_RW','Mix_LoadMUS_RW'] as $load) {
		$fp = fopen('sdltest://audio','r+b'); $rw = SDL_RWFromFP($fp,true);
		SdlTestStream::$hook = function() { throw new RuntimeException('original decoder input error'); };
		try { $load($rw,1); $messages[] = 'missed'; }
		catch(Throwable $error) { $messages[] = $error->getMessage(); }
		$reject('callback-input',fn() => $rw->Tell()); $rw->Close();
	}
	Mix_CloseAudio(); Mix_Quit(); SDL_Quit();
	echo json_encode(compact('chunkLoaded','chunkClosed','musicLoaded','musicClosed','messages','rejected'));
	`);
	expect(result).toEqual({chunkLoaded: true, chunkClosed: true, musicLoaded: true, musicClosed: true, messages: Array(2).fill('original decoder input error'), rejected: ['chunk-input', 'music-input', 'callback-input', 'callback-input']});
});
