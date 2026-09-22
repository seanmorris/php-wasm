import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, allocationStats} from './lib/sdl-bindings.mjs';
import {startAudio, primeAudio} from './lib/sdl-audio.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const setup = `
if(SDL_Init(SDL_INIT_AUDIO) !== 0 || Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024) !== 0) {
	throw new RuntimeException(SDL_GetError());
}
`;

/**
 * Require native calls to return promptly, closing a hung page before teardown.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {string} source PHP source.
 * @returns {Promise<unknown>} Parsed PHP output.
 */
const promptRun = async (page, source) => {
	let timer;
	try
	{
		const result = await Promise.race([
			run(page, source)
			, new Promise(resolve => timer = setTimeout(() => resolve('native timeout'), 5000))
		]);
		if(result === 'native timeout') { await page.close(); }
		expect(result).not.toBe('native timeout');
		return result;
	}
	finally { clearTimeout(timer); }
};

test('unused audio objects release on last reference and reject copied native ownership', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	$chunk = Mix_LoadWAV('/preload/sdl/click.wav'); $music = Mix_LoadMUS('/preload/sdl/loop.ogg');
	$refs = [WeakReference::create($chunk),WeakReference::create($music)];
	foreach([$chunk,$music] as $audio) {
		$reject('clone',fn() => clone $audio);
		$reject('serialize',fn() => serialize($audio));
		$name = get_class($audio);
		$reject('unserialize',fn() => unserialize('O:'.strlen($name).':"'.$name.'":0:{}'));
		$reject('construct',fn() => new $name);
	}
	unset($chunk,$music,$audio); gc_collect_cycles();
	echo json_encode(['alive'=>array_map(fn($ref) => $ref->get() !== null,$refs),'rejected'=>$rejected]);
	`)).toEqual({alive: [false, false], rejected: Array(2).fill(['clone', 'serialize', 'unserialize', 'construct']).flat()});
});

test('channels retain canonical chunk owners and never revive freed pointers', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	$chunk = Mix_LoadWAV('/preload/sdl/click.wav'); $ref = WeakReference::create($chunk);
	Mix_PlayChannel(0,$chunk,-1); Mix_PlayChannel(1,$chunk,-1);
	$alias = Mix_GetChunk(0); $same = $alias === $chunk && Mix_GetChunk(1) === $chunk;
	unset($chunk); gc_collect_cycles(); $retained = $ref->get() === $alias;
	Mix_Pause(0); $paused = Mix_Paused(0); Mix_Resume(0);
	Mix_FreeChunk($alias); Mix_FreeChunk($alias);
	$stopped = Mix_Playing(-1) === 0 && Mix_GetChunk(0) === null && Mix_GetChunk(1) === null;
	$reject('freed',fn() => Mix_PlayChannel(0,$alias,0)); unset($alias); gc_collect_cycles();
	$released = $ref->get() === null;
	$fresh = Mix_LoadWAV('/preload/sdl/click.wav');
	$notReused = Mix_GetChunk(0) === null;
	Mix_PlayChannel(0,$fresh,-1);
	$other = Mix_LoadWAV('/preload/sdl/click.wav'); Mix_FreeChunk($other);
	echo json_encode(compact('same','retained','paused','stopped','released','notReused') + ['playing'=>Mix_Playing(0),'rejected'=>$rejected]);
	`)).toEqual({same: true, retained: true, paused: 1, stopped: true, released: true, notReused: true, playing: 1, rejected: ['freed']});
	expect(await page.evaluate(async () => (await window.bindingPhp.binary)._Mix_GetChunk(1))).toBe(0);
});

test('channel replacement and shrinking retain only the current bounded associations', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	Mix_AllocateChannels(16); $refs = [];
	for($i=0;$i<60;$i++) {
		$chunk = Mix_LoadWAV('/preload/sdl/click.wav'); $refs[] = WeakReference::create($chunk);
		Mix_PlayChannel($i%16,$chunk,-1);
	}
	unset($chunk); gc_collect_cycles();
	$count = fn() => count(array_filter($refs,fn($ref) => $ref->get() !== null));
	$full = $count(); Mix_AllocateChannels(2); gc_collect_cycles(); $small = $count();
	Mix_HaltChannel(-1); $halted = Mix_Playing(-1) === 0 && Mix_GetChunk(0) instanceof Mix_Chunk;
	Mix_AllocateChannels(0); gc_collect_cycles(); $empty = $count();
	Mix_AllocateChannels(8); $clean = Mix_GetChunk(0) === null;
	echo json_encode(compact('full','small','halted','empty','clean'));
	`)).toEqual({full: 16, small: 2, halted: true, empty: 0, clean: true});
});

test('mixer channels validate bounds and fail safely after closing the device', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	$count = Mix_AllocateChannels(-1); $chunk = Mix_LoadWAV('/preload/sdl/click.wav');
	$reject('group-boundary',fn() => Mix_GroupChannel($count,1));
	$reject('range-end',fn() => Mix_GroupChannels(0,$count,1));
	$reject('backwards',fn() => Mix_GroupChannels(1,0,1));
	$reject('play-negative',fn() => Mix_PlayChannel(-2,$chunk,0));
	$reject('halt-negative',fn() => Mix_HaltChannel(-2));
	$reject('pause-negative',fn() => Mix_Pause(-2));
	$reject('resume-negative',fn() => Mix_Resume(-2));
	$reject('playing-negative',fn() => Mix_Playing(-2));
	$reject('effect-channel',fn() => Mix_SetDistance($count,1));
	$reject('effect-distance',fn() => Mix_SetDistance(0,256));
	$reject('effect-angle',fn() => Mix_SetPosition(0,32768,0));
	$overflow = Mix_AllocateChannels(2147483647) === -1 && Mix_AllocateChannels(-1) === $count && strlen(Mix_GetError()) > 0;
	$group = Mix_GroupChannels(0,1,42) === 2 && Mix_GroupCount(42) === 2;
	Mix_SetDistance(MIX_CHANNEL_POST,0); Mix_CloseAudio();
	$closed = [Mix_Playing(-1),Mix_Paused(-1),Mix_AllocateChannels(-1),Mix_GetChunk(0)];
	$reject('closed-group',fn() => Mix_GroupChannel(0,1));
	$reject('closed-play',fn() => Mix_PlayChannel(0,$chunk,0));
	$reject('closed-pause',fn() => Mix_Pause(-1));
	$reject('closed-effect',fn() => Mix_SetReverseStereo(0,1));
	$reject('bad-size',fn() => Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,65536));
	$reopened = Mix_OpenAudioDevice(44100,MIX_DEFAULT_FORMAT,2,1024,null,0) === 0;
	echo json_encode(compact('overflow','group','closed','reopened','rejected'));
	`)).toEqual({overflow: true, group: true, closed: [0, 0, 0, null], reopened: true, rejected: [
		'group-boundary', 'range-end', 'backwards', 'play-negative', 'halt-negative', 'pause-negative'
		, 'resume-negative', 'playing-negative', 'effect-channel', 'effect-distance', 'effect-angle'
		, 'closed-group', 'closed-play', 'closed-pause', 'closed-effect', 'bad-size'
	]});
});

test('audio opens preserve native default settings and negative volume queries', async ({page}) => {
	await start(page);
	expect(await run(page, `
	SDL_Init(SDL_INIT_AUDIO); $opened=[];
	foreach([[0,0,0,0],[44100,MIX_DEFAULT_FORMAT,0,1024],[44100,MIX_DEFAULT_FORMAT,2,0],[0,MIX_DEFAULT_FORMAT,2,1024]] as $settings) {
		$opened[]=Mix_OpenAudio(...$settings)===0 && Mix_QuerySpec($f,$s,$c)===1 && $f>0 && $s>0 && $c>0;
		Mix_CloseAudio();
	}
	$device=Mix_OpenAudioDevice(0,0,0,0,null,0)===0;
	$chunk=Mix_LoadWAV('/preload/sdl/click.wav');
	Mix_Volume(0,64); Mix_VolumeChunk($chunk,42); Mix_VolumeMusic(77);
	$query=[Mix_Volume(0,-99),Mix_VolumeChunk($chunk,-99),Mix_VolumeMusic(-99)];
	$count=Mix_AllocateChannels(-99); $reserve=Mix_ReserveChannels(-99);
	Mix_CloseAudio(); $closed=Mix_AllocateChannels(-99);
	echo json_encode(compact('opened','device','query','count','reserve','closed'));
	`)).toEqual({opened: [true, true, true, true], device: true, query: [64, 42, 77], count: 8, reserve: 0, closed: 0});
});

test('freeing or replacing fading music returns while browser audio is suspended', async ({page}) => {
	await startAudio(page);
	await run(page, setup);
	await page.evaluate(() => Promise.all(window.audioContexts.map(context => context.suspend())));
	expect(await page.evaluate(() => window.audioContexts.map(context => context.state))).toEqual(['suspended']);
	expect(await promptRun(page, `
	$first = Mix_LoadMUS('/preload/sdl/loop.ogg'); $second = Mix_LoadMUS('/preload/sdl/click.wav');
	Mix_PlayMusic($first,-1); Mix_FadeOutMusic(100); Mix_FreeMusic($first);
	$freed = Mix_PlayingMusic() === 0;
	$first = Mix_LoadMUS('/preload/sdl/loop.ogg');
	Mix_PlayMusic($first,-1); Mix_FadeOutMusic(100);
	$replaced = Mix_PlayMusic($second,-1) === 0;
	Mix_FreeMusic($first); $unrelated = Mix_PlayingMusic() === 1;
	$first = Mix_LoadMUS('/preload/sdl/loop.ogg'); Mix_FadeOutMusic(100);
	$fadeIn = Mix_FadeInMusic($first,-1,10) === 0; Mix_FadeOutMusic(100);
	$positioned = Mix_FadeInMusicPos($second,-1,10,0) === 0;
	Mix_FadeOutMusic(2147483647); Mix_FadeOutMusic(2147483647); Mix_FreeMusic($second);
	echo json_encode(compact('freed','replaced','unrelated','fadeIn','positioned'));
	`)).toEqual({freed: true, replaced: true, unrelated: true, fadeIn: true, positioned: true});
});

test('empty or fully reserved channel sets report safe volume and playback results', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	$chunk=Mix_LoadWAV('/preload/sdl/click.wav');
	Mix_ReserveChannels(3); Mix_AllocateChannels(1);
	$full=Mix_PlayChannel(-1,$chunk,0);
	$fade=Mix_FadeInChannelTimed(-1,$chunk,0,10,-1);
	Mix_AllocateChannels(0);
	$empty=Mix_PlayChannel(-1,$chunk,0); $volume=Mix_Volume(-1,64);
	Mix_ReserveChannels(0); Mix_AllocateChannels(1); $available=Mix_PlayChannel(-1,$chunk,0);
	echo json_encode(compact('full','fade','empty','volume','available'));
	`)).toEqual({full: -1, fade: -1, empty: -1, volume: 0, available: 0});
});

test('final SDL audio shutdown honors both reference counts and invalidates loaded objects', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	SDL_InitSubSystem(SDL_INIT_AUDIO); Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024);
	$chunk = Mix_LoadWAV('/preload/sdl/click.wav'); $music = Mix_LoadMUS('/preload/sdl/loop.ogg');
	Mix_PlayChannel(0,$chunk,-1); Mix_PlayMusic($music,-1);
	SDL_QuitSubSystem(SDL_INIT_AUDIO);
	$intermediate = Mix_QuerySpec($frequency,$format,$channels) === 2 && Mix_Playing(0) === 1;
	Mix_CloseAudio(); $one = Mix_QuerySpec($frequency,$format,$channels) === 1 && Mix_PlayingMusic() === 1;
	SDL_QuitSubSystem(SDL_INIT_AUDIO);
	$closed = Mix_QuerySpec($frequency,$format,$channels) === 0 && SDL_WasInit(SDL_INIT_AUDIO) === 0;
	$reject('chunk',fn() => Mix_VolumeChunk($chunk,0));
	$reopened = Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024) === 0;
	$reject('music',fn() => Mix_PlayMusic($music,0));
	Mix_FreeChunk($chunk); Mix_FreeMusic($music); Mix_CloseAudio(); Mix_CloseAudio();
	echo json_encode(compact('intermediate','one','closed','reopened','rejected'));
	`)).toEqual({intermediate: true, one: true, closed: true, reopened: true, rejected: ['chunk', 'music']});
});

test('format changes and decoder unload release the affected native resources', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}${rejectHelper}
	$chunk = Mix_LoadWAV('/preload/sdl/click.wav'); $music = Mix_LoadMUS('/preload/sdl/loop.ogg');
	Mix_PlayChannel(0,$chunk,-1); Mix_PlayMusic($music,-1); Mix_FadeOutMusic(100);
	$mono = Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,1,1024) === 0;
	$reject('old-chunk',fn() => Mix_PlayChannel(0,$chunk,0));
	$reject('old-music',fn() => Mix_PlayMusic($music,0));
	$chunk = Mix_LoadWAV('/preload/sdl/click.wav'); $music = Mix_LoadMUS('/preload/sdl/loop.ogg');
	Mix_PlayChannel(0,$chunk,-1); Mix_PlayMusic($music,-1); Mix_Quit();
	$pcm = Mix_Playing(0) === 1;
	$reject('unloaded-music',fn() => Mix_PlayMusic($music,0));
	$reload = Mix_Init(MIX_INIT_OGG) & MIX_INIT_OGG;
	$music = Mix_LoadMUS('/preload/sdl/loop.ogg'); $newMusic = Mix_PlayMusic($music,-1) === 0;
	echo json_encode(compact('mono','pcm','newMusic','rejected') + ['reload'=>$reload !== 0]);
	`)).toEqual({mono: true, pcm: true, newMusic: true, rejected: ['old-chunk', 'old-music', 'unloaded-music'], reload: true});
});

test('query outputs preserve typed references and original destructor exceptions', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	class AudioOutputs { public array $frequency = []; }
	$output = new AudioOutputs; $format = 'format'; $channels = 'channels';
	try { Mix_QuerySpec($output->frequency,$format,$channels); } catch(TypeError $error) {}
	$typed = [$format,$channels];
	class AudioOutputDestructor { function __destruct() { Mix_CloseAudio(); throw new RuntimeException('original query destructor'); } }
	$frequency = new AudioOutputDestructor; $message = '';
	try { Mix_QuerySpec($frequency,$format,$channels); } catch(Throwable $error) { $message = $error->getMessage(); }
	$after = [$format,$channels];
	$errorResult = Mix_SetError('game audio error'); $errorText = Mix_GetError(); $clear = Mix_ClearError();
	echo json_encode(compact('typed','message','after','errorResult','errorText','clear'));
	`)).toEqual({typed: ['format', 'channels'], message: 'original query destructor', after: ['format', 'channels'], errorResult: -1, errorText: 'game audio error', clear: null});
});

test('RWops callbacks may shut down audio without leaving the decoder a stale device', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	class AudioInput {
		public $context; private $position = 0; static $bytes; static $hook;
		function stream_open($path,$mode,$options,&$opened) { return true; }
		function stream_read($count) {
			if(self::$hook) { $hook=self::$hook; self::$hook=null; $hook(); }
			$result=substr(self::$bytes,$this->position,$count); $this->position+=strlen($result); return $result;
		}
		function stream_eof() { return $this->position >= strlen(self::$bytes); }
		function stream_tell() { return $this->position; }
		function stream_seek($offset,$whence) { $this->position=($whence===SEEK_SET?0:($whence===SEEK_CUR?$this->position:strlen(self::$bytes)))+$offset; return true; }
		function stream_stat() { return ['size'=>strlen(self::$bytes),'mode'=>0100600]; }
	}
	stream_wrapper_register('audioinput',AudioInput::class);
	AudioInput::$bytes=file_get_contents('/preload/sdl/click.wav'); $messages=[];
	foreach(['Mix_LoadWAV_RW','Mix_LoadMUS_RW'] as $load) {
		Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024);
		$fp=fopen('audioinput://track','rb'); $rw=SDL_RWFromFP($fp,true);
		AudioInput::$hook=fn() => SDL_QuitSubSystem(SDL_INIT_AUDIO);
		try { $load($rw,1); $messages[]='missed'; }
		catch(Throwable $error) { $messages[]=$error->getMessage(); }
	}
	echo json_encode($messages);
	`)).toEqual(Array(2).fill('SDL_mixer audio device is not open'));
});

test('resource destructors can resize channels and teardown rejects reentrant reopening', async ({page}) => {
	await start(page);
	expect(await run(page, `${setup}
	class AudioDestructor { public $callback; function __construct($callback) { $this->callback=$callback; } function __destruct() { ($this->callback)(); } }
	$chunk=Mix_LoadWAV('/preload/sdl/click.wav');
	@$chunk->guard=new AudioDestructor(function() { Mix_AllocateChannels(0); throw new RuntimeException('replacement destructor'); });
	Mix_PlayChannel(0,$chunk,-1); unset($chunk);
	$next=Mix_LoadWAV('/preload/sdl/click.wav'); $message='';
	try { Mix_PlayChannel(0,$next,-1); } catch(Throwable $error) { $message=$error->getMessage(); }
	unset($error); // The exception trace otherwise retains the next chunk argument.
	$empty=Mix_AllocateChannels(-1)===0 && Mix_Playing(-1)===0;
	Mix_AllocateChannels(1); $caught='';
	@$next->guard=new AudioDestructor(function() use (&$caught) {
		try { Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024); }
		catch(Throwable $error) { $caught=$error->getMessage(); }
	});
	Mix_PlayChannel(0,$next,-1); unset($next); Mix_CloseAudio();
	$closed=Mix_QuerySpec($f,$s,$c)===0;
	echo json_encode(compact('message','empty','caught','closed'));
	`)).toEqual({message: 'replacement destructor', empty: true, caught: 'SDL_mixer audio teardown is in progress', closed: true});
});

test('real audio retains playback through pause and releases music after completion', async ({page}) => {
	await startAudio(page);
	expect(await run(page, `${setup}
	$music=Mix_LoadMUS('/preload/sdl/click.wav'); $ref=WeakReference::create($music);
	Mix_PlayMusic($music,0); unset($music); gc_collect_cycles();
	echo json_encode($ref->get() instanceof Mix_Music);
	`)).toBe(true);
	await page.getByRole('button', {name: 'Resume audio'}).click();
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(0);
	await expect.poll(() => run(page, 'echo json_encode(Mix_PlayingMusic());')).toBe(0);
	expect(await run(page, 'gc_collect_cycles(); echo json_encode($ref->get() === null);')).toBe(true);
	await run(page, `
	$chunk=Mix_LoadWAV('/preload/sdl/click.wav'); Mix_PlayChannel(0,$chunk,-1);
	$music=Mix_LoadMUS('/preload/sdl/loop.ogg'); Mix_PlayMusic($music,-1);
	$musicRef=WeakReference::create($music); unset($music,$chunk);
	Mix_Pause(0); Mix_PauseMusic();
	`);
	await page.waitForTimeout(150);
	const paused = await page.evaluate(() => window.audioSamples);
	await page.waitForTimeout(150);
	expect(await page.evaluate(() => window.audioSamples)).toBe(paused);
	expect(await run(page, 'echo json_encode([Mix_Paused(0),Mix_PausedMusic(),$musicRef->get() instanceof Mix_Music]);')).toEqual([1, 1, true]);
	await run(page, 'Mix_Resume(0); Mix_ResumeMusic();');
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(paused + 2);
	await run(page, 'Mix_HaltMusic(); Mix_FadeOutChannel(0,40);');
	await expect.poll(() => run(page, 'echo json_encode(Mix_Playing(0));')).toBe(0);
	expect(await run(page, 'echo json_encode([$musicRef->get() === null,Mix_GetChunk(0) instanceof Mix_Chunk]);')).toEqual([true, true]);
	await run(page, '$chunk=Mix_GetChunk(0); Mix_PlayChannelTimed(0,$chunk,-1,40);');
	await expect.poll(() => run(page, 'echo json_encode(Mix_Playing(0));')).toBe(0);
});

test('unused chunk and music cycles return native allocation counts to baseline', async ({page}) => {
	await startAudio(page);
	await run(page, `${setup}
	$cycle=function($count) {
		$refs=[];
		for($i=0;$i<$count;$i++) {
			$chunk=Mix_LoadWAV('/preload/sdl/click.wav'); $music=Mix_LoadMUS('/preload/sdl/click.wav');
			@$chunk->self=$chunk; @$music->self=$music;
			$refs[]=WeakReference::create($chunk); $refs[]=WeakReference::create($music);
			unset($chunk,$music); gc_collect_cycles();
		}
		return count(array_filter($refs,fn($ref) => $ref->get() !== null));
	};
	if($cycle(10)) { throw new RuntimeException('warmup retained audio'); }
	`);
	await primeAudio(page);
	const before = await allocationStats(page);
	for(let batch = 0; batch < 3; batch++)
	{
		expect(await run(page, 'echo json_encode($cycle(50));')).toBe(0);
		const after = await allocationStats(page);
		expect(after.sdlAllocations).toBe(before.sdlAllocations);
		expect(after.liveBytes - before.liveBytes).toBeLessThan(128 * 1024);
	}
});

test('completed music cleanup preserves replacement playback started by a PHP destructor', async ({page}) => {
	await startAudio(page);
	await run(page, `${setup}
	class NextTrack {
		public $music;
		function __construct($music) { $this->music=$music; }
		function __destruct() { Mix_PlayMusic($this->music,-1); }
	}
	$music=Mix_LoadMUS('/preload/sdl/click.wav'); $next=Mix_LoadMUS('/preload/sdl/loop.ogg');
	$finished=WeakReference::create($music); $replacement=WeakReference::create($next);
	@$music->next=new NextTrack($next);
	Mix_PlayMusic($music,0); unset($music,$next);
	`);
	await page.getByRole('button', {name: 'Resume audio'}).click();
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(0);
	await expect.poll(() => run(page, 'Mix_PlayingMusic(); echo json_encode($finished->get() === null);')).toBe(true);
	expect(await run(page, 'echo json_encode([Mix_PlayingMusic(),$replacement->get() instanceof Mix_Music]);')).toEqual([1, true]);
	await run(page, 'Mix_HaltMusic();');
	expect(await run(page, 'echo json_encode($replacement->get() === null);')).toBe(true);
});

test('PHP refresh closes every mixer open reference and supports repeated playback restarts', async ({page}) => {
	await startAudio(page);
	for(let pass = 0; pass < 3; pass++)
	{
		await run(page, `${setup}
		Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024);
		$chunk=Mix_LoadWAV('/preload/sdl/click.wav'); Mix_PlayChannel(0,$chunk,-1);
		$music=Mix_LoadMUS('/preload/sdl/loop.ogg'); Mix_PlayMusic($music,-1); Mix_FadeOutMusic(100);
		`);
		expect(await page.evaluate(() => window.audioProcessors.filter(processor => processor.connected).length)).toBe(1);
		await page.evaluate(() => window.bindingPhp.refresh());
		expect(await page.evaluate(() => window.audioProcessors.filter(processor => processor.connected).length)).toBe(0);
		expect(await run(page, 'echo json_encode([Mix_QuerySpec($f,$s,$c),Mix_Playing(-1),Mix_GetChunk(0)]);')).toEqual([0, 0, null]);
	}
	await run(page, `${setup} $music=Mix_LoadMUS('/preload/sdl/loop.ogg'); Mix_PlayMusic($music,-1);`);
	await page.getByRole('button', {name: 'Resume audio'}).click();
	await expect.poll(() => page.evaluate(() => window.audioSamples)).toBeGreaterThan(2);
});
