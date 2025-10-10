<?php // {"autorun":true, "persist":true, "single-expression": false, "render-as": "text"}
if(!extension_loaded('vrzno'))
{
    printf("The VRZNO extension is not loaded. VRZNO is required for this demo and requires PHP >=8.2.");
    exit(1);
}

$url = 'https://api.weather.gov/gridpoints/TOP/40,74/forecast';

$window = new Vrzno;
$window->fetch($url)
->then(function($r) { return $r->json(); })
->then(var_dump(...));

echo "Yeah, its async.\n\n";
