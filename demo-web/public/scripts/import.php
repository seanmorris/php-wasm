<?php // {"autorun":true, "persist":true, "single-expression": false, "render-as": "text"}
if(!extension_loaded('vrzno'))
{
    printf("The VRZNO extension is not loaded. VRZNO is required for this demo and requires PHP >=8.2.");
    exit(1);
}

$window = new Vrzno;

$renderTo = $window->document->body->querySelector('#example');
$renderTo->innerHTML = '';

$import = vrzno_import('https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm');
$Plot = vrzno_await($import);

// Adapted from Javascript at:
// https://observablehq.com/@observablehq/plot-vertical-bars-rotated-labels

$brands = [
	["name" => "Apple", "value" => 214480],
	["name" => "Google", "value" => 155506],
	["name" => "Amazon", "value" => 100764],
	["name" => "Microsoft", "value" => 92715],
	["name" => "Coca-Cola", "value" => 66341],
	["name" => "Samsung", "value" => 59890],
	["name" => "Toyota", "value" => 53404],
	["name" => "Mercedes-Benz", "value" => 48601],
	["name" => "Facebook", "value" => 45168],
	["name" => "McDonald's", "value" => 43417],
	["name" => "Intel", "value" => 43293],
];

$plot = $Plot->barY($brands, [
	'x' => 'name',
	'y' => 'value',
	'sort' => (object)['x' => 'y', 'reverse' => true, 'limit' => 10],
	'fill' => 'steelblue',
])->plot([
	'marginBottom' => 60,
	'x' => ['tickRotate' => -30],
	'y' => [
		'transform' => fn($d) => $d / 1000,
		'label' => '↑ Market value (US dollars, billions)',
		'grid' => 5,
	]
]);

$renderTo->append($plot);
