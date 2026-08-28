<?php

final class AsyncifyCompilerFixture
{
    public static int $value = 1;
}

// Drupal compiles large, nested expressions while bootstrapping.  Keep the
// compiler recursion deep enough to exercise WebKit-sensitive Wasm frames,
// while remaining quick in the Node, Deno, Bun, and browser CI lanes.
$depth = 384;
$expression = 'AsyncifyCompilerFixture::$value';

for ($i = 0; $i < $depth; ++$i) {
    $expression = "AsyncifyCompilerFixture::\$value + ({$expression})";
}

$result = eval("return {$expression};");

if ($result !== $depth + 1) {
    throw new RuntimeException('deep compiler expression returned the wrong value');
}

if (class_exists('Fiber', false)) {
    $fiber = new Fiber(static function (): string {
        $value = Fiber::suspend('compiler-suspended');

        return "compiler-{$value}";
    });

    if ($fiber->start() !== 'compiler-suspended') {
        throw new RuntimeException('compiler regression fiber did not suspend');
    }

    if ($fiber->resume('resumed') !== null || $fiber->getReturn() !== 'compiler-resumed') {
        throw new RuntimeException('compiler regression fiber did not resume');
    }
}

echo 'asyncify-compiler-ok:' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . "\n";
