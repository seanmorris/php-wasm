<?php //{"autorun":true,"persist":true,"single-expression":false,"render-as":"html","canvas":true,"runtime":"sdl", "extensionFlags": 0}

error_reporting(E_ALL);

$shared = vrzno_env('shared');
if($shared->sdlCleanup)
{
    ($shared->sdlCleanup)();
}

if(!extension_loaded('sdl'))
{
    printf("The SDL extension is not loaded. Make sure it is in the system and there is a line for it on the php.ini file (eg \"extension=sdl.so\")");
    exit(1);
}

############

$width = 300;
$height = 150;

SDL_Init(SDL_INIT_VIDEO);

$window = new Vrzno;

$canvas = SDL_CreateWindow(
    "Drawing points on screen"
    , SDL_WINDOWPOS_UNDEFINED
    , SDL_WINDOWPOS_UNDEFINED
    , $width
    , $height
    , SDL_WINDOW_SHOWN | SDL_WINDOW_OPENGL
);

$renderer = SDL_CreateRenderer($canvas, 0, SDL_RENDERER_ACCELERATED);

$animation = 0;
$stopped = false;
$cleanup = function() use(&$cleanup, &$stopped, &$animation, $window, $renderer, $canvas, $shared) {
    if($stopped) return;
    $stopped = true;
    $window->cancelAnimationFrame($animation);
    SDL_DestroyRenderer($renderer);
    SDL_DestroyWindow($canvas);
    SDL_Quit();
    vrzno_env('onRefresh')->delete($cleanup);
    $shared->sdlCleanup = null;
};
vrzno_env('onRefresh')->add($cleanup);
$shared->sdlCleanup = $cleanup;

$j = 0;
$render = function() use(&$render, $renderer, &$j, $window, &$stopped, &$animation, $width) {
    if($stopped) return;
    SDL_SetRenderDrawColor($renderer, 255, 255, 255, 0);
    SDL_RenderClear($renderer);

    SDL_SetRenderDrawColor($renderer, 0, 0, 0, 255);

    for ($i = 0; $i < $width; ++$i) {
        $pos = 75 + (int)( sin($j+$i/100) * 15 );
        SDL_RenderDrawPoint($renderer, $i, $pos);
        $j += 0.00025;
    }

    $animation = $window->requestAnimationFrame($render);
};

phpinfo();

$render();
