<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "html"}

chdir('/');

$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("."));

foreach ($it as $name => $entry) {
	if('./proc/' === substr($name, 0, 7)) continue;
	echo $name . "<br/>";
}
