<?php

declare(strict_types=1);

function phpdbg_await_inner(string $label): string
{
	// vrzno_await() is an internal function. While it waits, its frame is the
	// innermost one, and it runs no PHP code.
	$answer = vrzno_await(vrzno_shared('phpdbgGate')); // PHPDBG_AWAIT_LINE

	return $label . ':' . $answer;
}

function phpdbg_await_outer(): string
{
	$outerLabel = 'await-complete';

	return phpdbg_await_inner($outerLabel);
}

echo phpdbg_await_outer() . "\n";
