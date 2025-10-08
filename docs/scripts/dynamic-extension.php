<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text"}

dl('php8.4-yaml.so');

echo yaml_emit([0,1,2,3, 'object' => ['key' => 'value']]);
