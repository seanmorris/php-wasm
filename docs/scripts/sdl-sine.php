<?php //{"autorun":true,"persist":true,"single-expression":false,"render-as":"html","canvas":true,"variant":"_sdl", "extensionFlags": 0}

error_reporting(E_ALL);

if(!extension_loaded('sdl'))
{
    printf("The SDL extension is not loaded. Make sure it is in the system and there is a line for it on the php.ini file (eg \"extension=sdl.so\")");
    exit(1);
}

if(!extension_loaded('vrzno'))
{
    printf("The VRZNO extension is not loaded. VRZNO is required for this demo and requires PHP >=8.2.");
    exit(1);
}

############

const WINDOW_WIDTH = 300;
const WINDOW_HEIGHT = 150;

SDL_Init(SDL_INIT_VIDEO);

$window = new Vrzno;

$canvas = SDL_CreateWindow(
    "Drawing points on screen"
    , SDL_WINDOWPOS_UNDEFINED
    , SDL_WINDOWPOS_UNDEFINED
    , WINDOW_WIDTH
    , WINDOW_HEIGHT
    , SDL_WINDOW_SHOWN | SDL_WINDOW_OPENGL
);

$renderer = SDL_CreateRenderer($canvas, 0, SDL_RENDERER_ACCELERATED);

$j = 0;
$render = function() use(&$render, $renderer, &$j, $window) {
    SDL_SetRenderDrawColor($renderer, 100, 0, 0, 0);
    SDL_RenderClear($renderer);

    SDL_SetRenderDrawColor($renderer, 0, 0, 0, 255);

    for ($i = 0; $i < WINDOW_WIDTH; ++$i) {
        SDL_RenderDrawPoint($renderer, $i, 75 + (int)( sin($j+$i/100) * 15 ));
        $j += 0.00025;
    }

    $window->requestAnimationFrame($render);
};

phpinfo();

$render();


