import {test, expect} from '@playwright/test';
import {start, run, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

/**
 * Warm the same failure/recovery path before checking repeated native ownership.
 * @param {import('@playwright/test').Page} page Idle native runtime.
 * @param {string} setup PHP defining stressAssets($cycles) and its resources.
 * @param {string} cleanup PHP releasing those resources.
 * @param {boolean} pngDiagnostics Whether truncated PNGs emit libpng errors.
 * @returns {Promise<object[]>} Native allocation snapshots attached to the test.
 */
const exercise = async (page, setup, cleanup, pngDiagnostics = false) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	const snapshot = async () => ({
		...await allocationStats(page)
		, fileDescriptors: await page.evaluate(async () => (await window.bindingPhp.binary).FS.streams.filter(Boolean).length)
	});
	const batchRun = async (source, cycles) => {
		if(!pngDiagnostics)
		{ return run(page, source); }
		const result = await page.evaluate(async source => {
			window.bindingOutput = window.bindingErrors = '';
			const status = await window.bindingPhp.run(`<?php ${source}`);
			return {status, output: window.bindingOutput, errors: window.bindingErrors};
		}, source);
		expect(result.status).toBe(0);
		expect(result.output).toBe('');
		// The two recognized but incomplete PNG headers each reach libpng through
		// both loaders. Preserve its diagnostics while rejecting any other stderr.
		const lines = result.errors.trim().split('\n');
		expect(lines).toHaveLength(cycles * 4);
		for(const line of lines)
		{ expect(line).toMatch(/^libpng error: [^\r\n]+$/); }
	};
	await batchRun(setup + '\nstressAssets(5);', 5);
	const samples = [{step: 'warm', ...await snapshot()}];
	for(let batch = 0; batch < 3; batch++)
	{
		await batchRun('stressAssets(20); gc_collect_cycles();', 20);
		samples.push({step: `batch-${batch + 1}`, ...await snapshot()});
	}
	await test.info().attach('native-allocations-before-cleanup', {body: JSON.stringify(samples, null, 2), contentType: 'application/json'});
	expect(samples.map(sample => sample.sdlAllocations)).toEqual(Array(4).fill(samples[0].sdlAllocations));
	expect(samples.map(sample => sample.fileDescriptors)).toEqual(Array(4).fill(samples[0].fileDescriptors));
	expect(samples[3].liveBytes).toBe(samples[2].liveBytes);
	await run(page, cleanup);
	samples.push({step: 'cleanup', ...await snapshot()});
	expect(errors).toEqual([]);
	await test.info().attach('native-allocations', {body: JSON.stringify(samples, null, 2), contentType: 'application/json'});
	return samples;
};

const failure = `
function failedAsset($value) {
	if($value !== null || SDL_GetError() === '') {
		throw new RuntimeException('Malformed asset did not return null with an SDL error');
	}
}
`;

test('truncated PNG, JPEG and BMP loads fail repeatedly and valid images still render', async ({page}) => {
	await start(page);
	await page.evaluate(async () => {
		const {FS} = await window.bindingPhp.binary;
		for(const format of ['png', 'jpg', 'bmp'])
		{
			const response = await fetch(`/php-wasm/fixtures/sdl/cube.${format}`);
			if(!response.ok)
{ throw new Error(`Missing ${format} fixture`); }
			FS.writeFile(`/preload/sdl/cube.${format}`, new Uint8Array(await response.arrayBuffer()));
		}
	});
	const samples = await exercise(page, String.raw`${failure}
	SDL_Init(SDL_INIT_VIDEO);
	$window = SDL_CreateWindow('Image stress',0,0,64,64,SDL_WINDOW_SHOWN);
	$renderer = SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED);
	$badImages = [];
	foreach(['png','jpg','bmp'] as $format) {
		$bytes = file_get_contents('/preload/sdl/cube.'.$format);
		foreach([0,1,8,24] as $length) {
			$path='/bad-'.$format.'-'.$length;
			file_put_contents($path,substr($bytes,0,$length));
			$badImages[]=$path;
		}
	}
	function stressAssets($cycles) {
		global $renderer,$badImages;
		for($cycle=0;$cycle<$cycles;$cycle++) {
			foreach($badImages as $path) {
				SDL_ClearError(); failedAsset(IMG_Load($path));
				SDL_ClearError(); failedAsset(IMG_LoadTexture($renderer,$path));
			}
			foreach(['png','jpg','bmp'] as $format) {
				$path='/preload/sdl/cube.'.$format;
				$surface=IMG_Load($path);
				if(!$surface || $surface->w!==128 || $surface->h!==128) { throw new RuntimeException('Image recovery failed'); }
				SDL_FreeSurface($surface);
				$texture=IMG_LoadTexture($renderer,$path);
				if(!$texture || SDL_RenderCopy($renderer,$texture,null,null)!==0) { throw new RuntimeException(SDL_GetError()); }
				$pixel=SDL_RenderReadPixels($renderer,new SDL_Rect(0,0,1,1),SDL_PIXELFORMAT_ABGR8888);
				if(strlen($pixel)!==4 || ord($pixel[3])!==255) { throw new RuntimeException('Image did not render'); }
				SDL_DestroyTexture($texture);
			}
		}
	}
	`, 'SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();', true);
	expect(samples.at(-1).sdlAllocations).toBe(3);
});

test('truncated fonts fail repeatedly without retaining faces and valid UTF-8 still renders', async ({page}) => {
	await start(page);
	const samples = await exercise(page, String.raw`${failure}
	if(TTF_Init()!==0) { throw new RuntimeException(SDL_GetError()); }
	$bytes=file_get_contents('/preload/sdl/DejaVuSansMono.ttf');
	$badFonts=[];
	foreach([0,1,4,12,128] as $length) {
		$path='/bad-font-'.$length;
		file_put_contents($path,substr($bytes,0,$length)); $badFonts[]=$path;
	}
	file_put_contents('/bad-font-junk',str_repeat('not a font',100));
	$badFonts[]='/bad-font-junk';
	function stressAssets($cycles) {
		global $badFonts;
		for($cycle=0;$cycle<$cycles;$cycle++) {
			foreach($badFonts as $path) { SDL_ClearError(); failedAsset(TTF_OpenFont($path,18)); }
			$font=TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf',18);
			if(!$font) { throw new RuntimeException(SDL_GetError()); }
			$surface=TTF_RenderUTF8_Blended($font,'é → PHP',new SDL_Color(255,255,255,255));
			if(!$surface || $surface->w<10 || $surface->h<10) { throw new RuntimeException('Font recovery failed'); }
			SDL_FreeSurface($surface); TTF_CloseFont($font);
		}
	}
	`, 'TTF_Quit(); SDL_Quit();');
	expect(samples.at(-1).sdlAllocations).toBe(0);
});

test('truncated WAV, Ogg and MP3 loads release decoder state and preserve mixer recovery', async ({page}) => {
	await start(page);
	const samples = await exercise(page, String.raw`${failure}
	SDL_Init(SDL_INIT_AUDIO);
	if(Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024)!==0) { throw new RuntimeException(SDL_GetError()); }
	$badAudio=[];
	foreach(['click.wav','loop.ogg','WOJTEK3.mp3'] as $name) {
		$bytes=file_get_contents('/preload/sdl/'.$name);
		foreach([0,1,4,12] as $length) {
			$path='/bad-'.$name.'-'.$length;
			file_put_contents($path,substr($bytes,0,$length)); $badAudio[]=$path;
		}
	}
	function stressAssets($cycles) {
		global $badAudio;
		for($cycle=0;$cycle<$cycles;$cycle++) {
			foreach($badAudio as $path) {
				SDL_ClearError(); failedAsset(Mix_LoadWAV($path));
				SDL_ClearError(); failedAsset(Mix_LoadMUS($path));
			}
			$chunk=Mix_LoadWAV('/preload/sdl/click.wav');
			$music=Mix_LoadMUS('/preload/sdl/loop.ogg');
			if(!$chunk || !$music || Mix_PlayChannel(0,$chunk,-1)!==0 || Mix_PlayMusic($music,-1)!==0) {
				throw new RuntimeException(SDL_GetError());
			}
			if(Mix_Playing(0)!==1 || Mix_PlayingMusic()!==1) { throw new RuntimeException('Mixer recovery failed'); }
			Mix_HaltChannel(-1); Mix_HaltMusic(); Mix_FreeChunk($chunk); Mix_FreeMusic($music);
		}
	}
	`, 'Mix_CloseAudio(); Mix_Quit(); SDL_Quit();');
	expect(samples.at(-1).sdlAllocations).toBe(0);
});

test('failed chunk format detection closes owned streams and preserves borrowed RWops', async ({page}) => {
	await start(page);
	const samples = await exercise(page, String.raw`${failure}
	SDL_Init(SDL_INIT_AUDIO);
	if(Mix_OpenAudio(44100,MIX_DEFAULT_FORMAT,2,1024)!==0) { throw new RuntimeException(SDL_GetError()); }
	function stressAssets($cycles) {
		for($cycle=0;$cycle<$cycles;$cycle++) {
			foreach(["OggS","ID3\x04",str_repeat('x',11)] as $bytes) {
				file_put_contents('/bad-chunk',$bytes);
				SDL_ClearError(); failedAsset(Mix_LoadWAV('/bad-chunk'));
				foreach([0,1] as $freesrc) {
					$rw=SDL_RWFromConstMem($bytes);
					SDL_ClearError(); failedAsset(Mix_LoadWAV_RW($rw,$freesrc));
					if($freesrc) {
						$closed=false;
						try { $rw->Size(); } catch(Error $error) { $closed=true; }
						if(!$closed) { throw new RuntimeException('Owned RWops was not closed'); }
					} else {
						if($rw->Size()!==strlen($bytes)) { throw new RuntimeException('Borrowed RWops was changed'); }
						$rw->Seek(0,RW_SEEK_SET); $rw->Read($restored,1,strlen($bytes));
						if($restored!==$bytes) { throw new RuntimeException('Borrowed bytes were changed'); }
					}
					$rw->Close();
					$fp=fopen('/bad-chunk','rb'); $rw=SDL_RWFromFP($fp,true);
					SDL_ClearError(); failedAsset(Mix_LoadWAV_RW($rw,$freesrc));
					if(is_resource($fp)!==!$freesrc) { throw new RuntimeException('PHP stream ownership changed'); }
					$rw->Close();
					if(is_resource($fp)) { throw new RuntimeException('PHP stream remained open'); }
				}
			}
		}
	}
	`, 'Mix_CloseAudio(); Mix_Quit(); SDL_Quit();');
	expect(samples.at(-1).sdlAllocations).toBe(0);
});
