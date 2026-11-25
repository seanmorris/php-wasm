import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PhpNode } from './lib/PhpNode.mjs';

const phpVersion = process.env.PHP_VERSION ?? '8.4';
const source = readFileSync(new URL('./fixtures/compile-suspend.php', import.meta.url), 'utf8');
const expected = phpVersion === '8.0'
	? 'fiber-unavailable:8.0\n'
	: `compile-suspend-ok:${phpVersion}\n`;

/**
 * Starts PHP and collects what it prints.
 * @param {object} args Runtime options.
 * @returns {Promise<{php: PhpNode, output: {stdOut: string, stdErr: string}}>} The runtime and its output so far.
 */
async function start(args = {})
{
	const php = new PhpNode(args);
	const output = {stdOut: '', stdErr: ''};

	php.addEventListener('output', event => event.detail.forEach(line => void (output.stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (output.stdErr += line)));

	await php.binary;

	return {php, output};
}

test(`a Fiber can suspend from an error handler while PHP compiles (${phpVersion})`, async () => {
	const {php, output} = await start();

	// The second run shows the first one left the module usable.
	for(let invocation = 0; invocation < 2; ++invocation)
	{
		output.stdOut = '';
		output.stdErr = '';

		const exitCode = await php.run(source);

		assert.equal(exitCode, 0, `invocation ${invocation + 1} failed: ${output.stdErr || output.stdOut}`);
		assert.equal(output.stdOut, expected);
		assert.equal(output.stdErr, '');
	}
});

test(`an error handler can await JavaScript while PHP compiles (${phpVersion})`, async () => {
	let waits = 0;
	const {php, output} = await start({
		waitForCompile: async () => {
			await new Promise(resolve => setTimeout(resolve, 1));
			++waits;
		}
	});

	const exitCode = await php.run(`<?php
		if (!function_exists('vrzno_await')) { echo "vrzno-unavailable\\n"; return; }
		$id = bin2hex(random_bytes(6));
		$levels = [];
		set_error_handler(static function (int $level, string $message) use (&$levels): bool {
			vrzno_await(vrzno_env('waitForCompile')());
			$levels[] = $level;
			return true;
		});
		// An optional parameter before a required one is deprecated at compile time.
		eval("function compile_await_{$id}(\\$a = 1, \\$b) { return \\$b; }");
		restore_error_handler();
		echo $levels === [E_DEPRECATED] && ("compile_await_{$id}")(1, 'ok') === 'ok'
			? "compile-await-ok\\n"
			: 'wrong:' . json_encode($levels) . "\\n";
	`);

	assert.equal(exitCode, 0, output.stdErr || output.stdOut);
	assert.equal(output.stdErr, '');

	if(output.stdOut === 'vrzno-unavailable\n')
	{
		return;
	}

	assert.equal(output.stdOut, 'compile-await-ok\n');
	assert.equal(waits, 1);
	assert.equal(await php.run('<?php echo "next call";'), 0);
	assert.ok(output.stdOut.endsWith('next call'));
});
