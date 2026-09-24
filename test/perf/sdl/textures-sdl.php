<?php

perfCheck(SDL_Init(SDL_INIT_VIDEO) === 0, SDL_GetError());
$window = SDL_CreateWindow('SDL texture streaming', 0, 0, 128, 128, SDL_WINDOW_SHOWN);
$renderer = SDL_CreateRenderer($window, -1, SDL_RENDERER_ACCELERATED);
perfCheck((bool)$renderer, SDL_GetError());
$texture = SDL_CreateTexture($renderer, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STREAMING, 256, 256);
perfCheck((bool)$texture, SDL_GetError());
$pixels = [str_repeat("\xff\0\0\xff", 65536), str_repeat("\0\xff\0\xff", 65536)];
$expected = str_repeat("\0\xff\0\xff", 16384);
$cases['update_texture'] = [
	'batches' => 64, 'itemsPerBatch' => 1, 'callsPerBatch' => 2, 'bytesPerBatch' => 262144
	, 'prepare' => function() use ($renderer, $texture, $pixels) {
		perfCheck(SDL_UpdateTexture($texture, null, $pixels[0], 1024) === 0, SDL_GetError());
		perfCheck(SDL_RenderCopy($renderer, $texture, null, null) === 0, SDL_GetError());
		$before = SDL_RenderReadPixels($renderer, null, SDL_PIXELFORMAT_ABGR8888);
		perfCheck($before === str_repeat("\xff\0\0\xff", 16384), 'SDL texture sample did not start red');
		perfCheck(SDL_SetRenderDrawColor($renderer, 0, 0, 0, 255) === 0, SDL_GetError());
		perfCheck(SDL_RenderClear($renderer) === 0, SDL_GetError());
		SDL_RenderReadPixels($renderer, null, SDL_PIXELFORMAT_ABGR8888);
	}
	, 'submit' => function($batch) use ($renderer, $texture, $pixels) {
		if(SDL_UpdateTexture($texture, null, $pixels[$batch % 2], 1024) !== 0) { throw new RuntimeException(SDL_GetError()); }
		if(SDL_RenderCopy($renderer, $texture, null, null) !== 0) { throw new RuntimeException(SDL_GetError()); }
	}
	, 'finish' => function() use ($renderer) { return SDL_RenderReadPixels($renderer, null, SDL_PIXELFORMAT_ABGR8888); }
	, 'verify' => function($result) use ($expected) { perfCheck($result === $expected, 'Streamed SDL texture pixels differ'); }
];
$cleanup = function() use ($texture, $renderer, $window) {
	SDL_DestroyTexture($texture); SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
};
