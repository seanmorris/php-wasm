<?php //{"autorun":true,"persist":true,"single-expression":false,"render-as":"text"}

$window = new Vrzno;

$renderTo = $window->document->body->querySelector('#example');
$renderTo->innerHTML = '';

$import = vrzno_import('https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm');
$Plot = vrzno_await($import);

$binX = $Plot->binX(
    ['y'=> function($a,$b){
        return -cos($b->x1*pi());
    }],
    ['x' => function() { return rand(0,100)/100; }]
);

$plot2 = $Plot->rectY((object)['length' => 100000], $binX)->plot();


$renderTo->append($plot2);
