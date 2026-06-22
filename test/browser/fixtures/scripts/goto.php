<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text"}

$x = false;

a:

if(!$x)
{
	goto b;
}

echo '2. Foo' . PHP_EOL;

goto c;

b:

echo '1. Bar' . PHP_EOL;

if(!$x)
{
	$x = true;
	goto a;
}

c:
echo '3. Baz' . PHP_EOL;
