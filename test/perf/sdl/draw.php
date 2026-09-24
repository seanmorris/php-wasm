<?php

if(SDL_Init(SDL_INIT_VIDEO) !== 0) { throw new RuntimeException(SDL_GetError()); }
$window = SDL_CreateWindow('SDL draw benchmark', 0, 0, 128, 128, SDL_WINDOW_SHOWN);
$renderer = SDL_CreateRenderer($window, -1, SDL_RENDERER_ACCELERATED);
if(!$renderer) { throw new RuntimeException(SDL_GetError()); }

$check = function($status) {
	if($status !== 0) { throw new RuntimeException(SDL_GetError()); }
};
$clock = function() {
	return (float)SDL_GetPerformanceCounter() * 1000 / (float)SDL_GetPerformanceFrequency();
};
$rectangles = $vertices = $indices = [];
$xy = '';
for($row = 0; $row < 32; $row++)
{
	for($column = 0; $column < 32; $column++)
	{
		$x = $column * 4; $y = $row * 4; $base = count($vertices);
		$rectangles[] = new SDL_Rect($x, $y, 2, 2);
		foreach([[$x,$y],[$x+2,$y],[$x+2,$y+2],[$x,$y+2]] as [$vx,$vy])
		{
			$vertices[] = [$vx,$vy,255,255,255,255,0,0];
			$xy .= pack('g*', $vx, $vy);
		}
		array_push($indices, $base, $base+1, $base+2, $base, $base+2, $base+3);
	}
}
$packedIndices = pack('v*', ...$indices);
$batchesPerSample = 64;
$white = "\xff\xff\xff\xff";
$draws = [
	'single_rectangles' => function() use ($renderer, $rectangles) {
		foreach($rectangles as $rect)
		{
			if(SDL_RenderFillRect($renderer, $rect) !== 0) { throw new RuntimeException(SDL_GetError()); }
		}
	}
	, 'rectangle_batch' => function() use ($renderer, $rectangles, $check) {
		$check(SDL_RenderFillRects($renderer, $rectangles));
	}
	, 'geometry_arrays' => function() use ($renderer, $vertices, $indices, $check) {
		$check(SDL_RenderGeometry($renderer, null, $vertices, $indices));
	}
	, 'geometry_packed' => function() use ($renderer, $xy, $white, $packedIndices, $check) {
		$check(SDL_RenderGeometryRaw($renderer, null, $xy, 8, $white, 0, null, 0, 4096, $packedIndices, 6144, 2));
	}
];
$read = new SDL_Rect(0,0,1,1);
$measure = function($draw) use ($renderer, $read, $check, $clock, $batchesPerSample) {
	$check(SDL_SetRenderDrawColor($renderer, 0, 0, 0, 255));
	$check(SDL_RenderClear($renderer));
	// Flush the clear before measuring submission; readback finishes the draw.
	SDL_RenderReadPixels($renderer, $read, SDL_PIXELFORMAT_ABGR8888);
	$check(SDL_SetRenderDrawColor($renderer, 255, 255, 255, 255));
	$start = $clock();
	for($batch = 0; $batch < $batchesPerSample; $batch++) { $draw(); }
	$submitted = $clock();
	$pixel = SDL_RenderReadPixels($renderer, $read, SDL_PIXELFORMAT_ABGR8888);
	$end = $clock();
	if($pixel !== "\xff\xff\xff\xff") { throw new RuntimeException('Benchmark did not draw the expected pixel'); }
	return ['submitMs'=>$submitted-$start, 'flushMs'=>$end-$submitted, 'totalMs'=>$end-$start];
};

try
{
	$check(SDL_GetRendererInfo($renderer, $info));
	foreach($draws as $draw) { for($warm = 0; $warm < 4; $warm++) { $measure($draw); } }
	$memoryBefore = memory_get_usage();
	$samples = [];
	$names = array_keys($draws);
	for($round = 0; $round < 12; $round++)
	{
		// Rotate order to spread warmup and scheduling effects across cases.
		foreach($names as $offset => $unused)
		{
			$name = $names[($round + $offset) % count($names)];
			$samples[$name][] = $measure($draws[$name]);
		}
	}
	$memoryAfter = memory_get_usage();
	echo json_encode([
		'phpVersion' => PHP_VERSION, 'renderer' => $info, 'rectanglesPerBatch' => count($rectangles)
		, 'rectanglesPerSample' => count($rectangles) * $batchesPerSample
		, 'batchesPerSample' => $batchesPerSample
		, 'warmupsPerCase' => 4, 'samples' => $samples
		, 'phpMemoryBeforeSamples' => $memoryBefore, 'phpMemoryAfterSamples' => $memoryAfter
		, 'phpMemoryPeakAllocated' => memory_get_peak_usage(true)
		, 'phpMemoryAccountingAvailable' => $memoryBefore > 0
	]);
}
finally
{
	SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); SDL_Quit();
}
