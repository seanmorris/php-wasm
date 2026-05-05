<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text"}

$version = PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;

dl("php$version-yaml.so");

echo yaml_emit([0,1,2,3, 'object' => ['key' => 'value']]);
