<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text"}

chdir('/');

$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("."));

$files = [];

foreach ($it as $name => $entry) {
	if('./proc/' === substr($name, 0, 7)) continue;
	$files[] = $name;
}

sort($files);
print_r($files);
