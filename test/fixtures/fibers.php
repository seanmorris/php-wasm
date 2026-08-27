<?php

$runFiberRegression = static function (): void {
    $version = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;

    if (!class_exists('Fiber', false)) {
        echo "fiber-unavailable:{$version}\n";
        return;
    }

    $check = static function ($condition, string $message): void {
        if (!$condition) {
            throw new RuntimeException($message);
        }
    };

    // Basic suspend/resume and return-value transfer.
    $trace = [];
    $fiber = new Fiber(static function () use (&$trace): string {
        $trace[] = 'A';
        $value = Fiber::suspend('suspended');
        $trace[] = "B:{$value}";

        return 'returned';
    });

    $check($fiber->start() === 'suspended', 'basic start transfer failed');
    $check($trace === ['A'], 'fiber did not suspend at the expected point');
    $check($fiber->resume('resumed') === null, 'terminated fiber returned a suspend value');
    $check($trace === ['A', 'B:resumed'], 'basic resume transfer failed');
    $check($fiber->getReturn() === 'returned', 'fiber return value was lost');

    // Repeated switches through the same fiber.
    $fiber = new Fiber(static function (): int {
        $total = 0;
        for ($i = 1; $i <= 3; ++$i) {
            $total += Fiber::suspend("pause:{$i}");
        }

        return $total;
    });

    $check($fiber->start() === 'pause:1', 'first multiple-suspend transfer failed');
    $check($fiber->resume(10) === 'pause:2', 'second multiple-suspend transfer failed');
    $check($fiber->resume(20) === 'pause:3', 'third multiple-suspend transfer failed');
    $check($fiber->resume(30) === null, 'multiple-suspend fiber did not terminate');
    $check($fiber->getReturn() === 60, 'multiple-suspend values were corrupted');

    // An exception thrown by fiber code must cross back to its caller.
    $fiber = new Fiber(static function (): void {
        throw new RuntimeException('inside');
    });
    try {
        $fiber->start();
        $check(false, 'exception inside a fiber was swallowed');
    } catch (RuntimeException $exception) {
        $check($exception->getMessage() === 'inside', 'wrong exception escaped the fiber');
    }

    // Fiber::throw() must enter the suspended fiber and preserve its return value.
    $fiber = new Fiber(static function (): string {
        try {
            Fiber::suspend('throw-ready');
        } catch (RuntimeException $exception) {
            return 'caught:' . $exception->getMessage();
        }

        return 'not-caught';
    });
    $check($fiber->start() === 'throw-ready', 'Fiber::throw setup failed');
    $check($fiber->throw(new RuntimeException('injected')) === null, 'Fiber::throw did not terminate the fiber');
    $check($fiber->getReturn() === 'caught:injected', 'Fiber::throw payload was corrupted');

    // Exceptions raised after a resume cross the suspend/resume boundary.
    $fiber = new Fiber(static function (): void {
        Fiber::suspend('exception-ready');
        throw new LogicException('after-resume');
    });
    $check($fiber->start() === 'exception-ready', 'resume exception setup failed');
    try {
        $fiber->resume();
        $check(false, 'exception after resume was swallowed');
    } catch (LogicException $exception) {
        $check($exception->getMessage() === 'after-resume', 'wrong exception crossed resume');
    }

    // Destroying a suspended fiber force-closes it and executes finally blocks.
    $destroyed = false;
    $fiber = new Fiber(static function () use (&$destroyed): void {
        try {
            Fiber::suspend('destroy-ready');
        } finally {
            $destroyed = true;
        }
    });
    $check($fiber->start() === 'destroy-ready', 'destruction setup failed');
    unset($fiber);
    $check($destroyed, 'destroying a suspended fiber did not run its finally block');

    // Exercise main -> A -> B -> A -> main switching.
    $trace = [];
    $fiberA = new Fiber(static function () use (&$trace, $check): string {
        $trace[] = 'A:start';
        $fiberB = new Fiber(static function () use (&$trace): string {
            $trace[] = 'B:start';
            $value = Fiber::suspend('B:suspended');
            $trace[] = "B:{$value}";

            return 'B:return';
        });

        $check($fiberB->start() === 'B:suspended', 'nested B start failed');
        $trace[] = 'A:after-B-start';
        $check($fiberB->resume('resumed') === null, 'nested B resume failed');
        $check($fiberB->getReturn() === 'B:return', 'nested B return value was lost');
        $trace[] = 'A:before-suspend';
        $value = Fiber::suspend('A:suspended');
        $trace[] = "A:{$value}";

        return 'A:return';
    });

    $check($fiberA->start() === 'A:suspended', 'nested A start failed');
    $check($fiberA->resume('resumed') === null, 'nested A resume failed');
    $check($fiberA->getReturn() === 'A:return', 'nested A return value was lost');
    $check($trace === [
        'A:start',
        'B:start',
        'A:after-B-start',
        'B:resumed',
        'A:before-suspend',
        'A:resumed',
    ], 'nested fiber switch order was corrupted');

    // Repeated allocation, switching, termination, and destruction catches stale
    // transfer pointers and stack ownership bugs while keeping only one fiber alive.
    for ($i = 0; $i < 2000; ++$i) {
        $fiber = new Fiber(static function (int $seed): int {
            $first = Fiber::suspend($seed + 1);
            $second = Fiber::suspend($first + 1);

            return $second + 1;
        });

        $check($fiber->start($i) === $i + 1, "stress start failed at {$i}");
        $check($fiber->resume($i + 10) === $i + 11, "stress first resume failed at {$i}");
        $check($fiber->resume($i + 20) === null, "stress termination failed at {$i}");
        $check($fiber->getReturn() === $i + 21, "stress return failed at {$i}");
        unset($fiber);
    }

    echo "fibers-ok:{$version}\n";
};

$runFiberRegression();
unset($runFiberRegression);
