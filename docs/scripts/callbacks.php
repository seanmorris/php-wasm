<?php // {"autorun":true, "persist":true, "single-expression": false, "render-as": "text"}

##################################
#                                #
# Open your JS console and run:  #
#                                #
# > phpFuncA()                   #
# > phpFuncB()                   #
#                                #
##################################

if(!extension_loaded('vrzno'))
{
    printf("The VRZNO extension is not loaded. VRZNO is required for this demo and requires PHP >=8.2.");
    exit(1);
}

$setup = $setup ?? false;

$x = $x ?? 0;
$y = $y ?? 0;

var_dump($x);

if(!$setup)
{
    $window = new Vrzno;

    $f = $window->phpFuncA = function() use(&$x, &$y, $window) {
        printf('RAN phpFuncA! $x: %d, $y: %d' . PHP_EOL, ++$x, $y);
		return $x;
    };

    $g = $window->phpFuncB = function() use(&$x, &$y, $window) {
		$window->alert(sprintf('RAN phpFuncB! $x: %d, $y: %d', $x, ++$y));
		return $y;
    };

    $setup = true;

    echo "Initialized.\n";
    fprintf(fopen('php://STDERR', 'w'), 'Open your JS console and run' . PHP_EOL);
    fprintf(fopen('php://STDERR', 'w'), 'phpFuncA() or phpFuncB()' . PHP_EOL);
}

$window->phpFuncA();
// $window->phpFuncB();

// vrzno_eval('window.phpFuncA()');
vrzno_eval('window.phpFuncB()');
