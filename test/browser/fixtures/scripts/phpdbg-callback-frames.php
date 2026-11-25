<?php

declare(strict_types=1);

final class PhpDbgCallbackJob
{
	public function run(array $items): array
	{
		// array_map() puts an internal function's frame between run() and the callback.
		return array_map('phpdbg_callback_double', $items);
	}
}

function phpdbg_callback_double(int $number): int
{
	$doubled = $number * 2; // PHPDBG_CALLBACK_BREAKPOINT

	return $doubled;
}

$phpdbgCallbackJob = new PhpDbgCallbackJob();

echo 'callback-complete:' . implode(',', $phpdbgCallbackJob->run([21])) . "\n";
