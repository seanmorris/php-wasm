<?php

// PHP calls user error handlers for deprecations raised while it compiles, and
// a handler may suspend.  The compiler's frames are then on the stack, so they
// have to unwind and rewind like any others.
$runCompileSuspendRegression = static function (): void {
    $version = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;

    if (!class_exists('Fiber', false)) {
        echo "fiber-unavailable:{$version}\n";
        return;
    }

    // Declarations must not collide when the fixture runs twice on one module.
    $id = bin2hex(random_bytes(6));

    $compileInFiber = static function (string $label, callable $compile): int {
        $suspensions = 0;
        $fiber = new Fiber(static function () use ($compile): string {
            set_error_handler(static function (int $level, string $message): bool {
                if (Fiber::suspend($level) !== 'resumed') {
                    throw new RuntimeException('handler resumed with the wrong value');
                }

                return true;
            });

            try {
                $compile();
            } finally {
                restore_error_handler();
            }

            return 'compiled';
        });

        for ($level = $fiber->start(); !$fiber->isTerminated(); $level = $fiber->resume('resumed')) {
            if ($level !== E_DEPRECATED) {
                throw new RuntimeException("{$label}: expected a deprecation, got " . var_export($level, true));
            }

            ++$suspensions;
        }

        if ($fiber->getReturn() !== 'compiled') {
            throw new RuntimeException("{$label}: compilation did not finish after resuming");
        }

        if ($suspensions < 1) {
            throw new RuntimeException("{$label}: no deprecation was raised while compiling");
        }

        return $suspensions;
    };

    // An optional parameter before a required one is deprecated when the
    // function is compiled.
    $compileInFiber('eval', static function () use ($id): void {
        eval("function compile_suspend_eval_{$id}(\$a = 1, \$b) { return \$b; }");
    });

    if (("compile_suspend_eval_{$id}")(1, 'eval') !== 'eval') {
        throw new RuntimeException('eval: the function compiled around a suspension does not work');
    }

    $file = sys_get_temp_dir() . "/php-wasm-compile-suspend-{$id}.php";
    file_put_contents($file, "<?php function compile_suspend_include_{$id}(\$a = 1, \$b) { return \$b; }");

    try {
        $compileInFiber('include', static function () use ($file): void {
            include $file;
        });
    } finally {
        unlink($file);
    }

    if (("compile_suspend_include_{$id}")(1, 'include') !== 'include') {
        throw new RuntimeException('include: the function compiled around a suspension does not work');
    }

    // Linking a class to an internal interface happens during compilation and
    // reports incompatible return types as deprecations.
    $compileInFiber('class', static function () use ($id): void {
        eval("final class CompileSuspend{$id} implements Countable { public function count() { return 3; } }");
    });

    if (count(new ("CompileSuspend{$id}")) !== 3) {
        throw new RuntimeException('class: the class linked around a suspension does not work');
    }

    echo "compile-suspend-ok:{$version}\n";
};

$runCompileSuspendRegression();
