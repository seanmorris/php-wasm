<?php // {"autorun":true, "persist":true, "single-expression": false, "render-as": "text"}
if(!extension_loaded('vrzno'))
{
    printf("The VRZNO extension is not loaded. VRZNO is required for this demo and requires PHP >=8.2.");
    exit(1);
}

$window = $window ?? new Vrzno;

$promise = new $window->Promise(function($accept, $reject) {
	$window = new Vrzno;
	$window->setTimeout(fn() => $accept('Pass.'), 1000);
	// $window->setTimeout(fn() => $reject('Fail.'), 1000);
});

$promise
	->then(var_dump(...))
	->catch(var_dump(...));
