import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';
import { env } from 'node:process';
import libxml from 'php-wasm-libxml';
import simplexml from 'php-wasm-simplexml';

test('libxml error handlers can await JavaScript and resume parsing', {timeout: 10000}, async () => {
	let waits = 0;
	let stdout = '', stderr = '';
	const php = new PhpNode(nodeRuntimeOptions({
		sharedLibs: env.WITH_SIMPLEXML === 'dynamic' ? [libxml, simplexml] : []
		, waitForError: async () => {
			await Promise.resolve();
			++waits;
		}
	}));
	php.addEventListener('output', event => event.detail.forEach(line => stdout += line));
	php.addEventListener('error', event => event.detail.forEach(line => stderr += line));
	await php.binary;

	const result = await php.run(`<?php
		$warnings = 0;
		set_error_handler(static function ($level, $message) use (&$warnings) {
			vrzno_await(vrzno_env('waitForError')());
			++$warnings;
			return true;
		});
		var_dump(simplexml_load_string('<root>'));
		restore_error_handler();
		echo "warnings:", $warnings, "\\n";
		var_dump((string) simplexml_load_string('<root>resumed</root>'));
	`);

	assert.equal(result, 0, stderr || stdout);
	assert.equal(waits, 3);
	assert.equal(stdout, 'bool(false)\nwarnings:3\nstring(7) "resumed"\n');
	assert.equal(stderr, '');
	assert.equal(await php.run('<?php echo "next call";'), 0);
	assert.ok(stdout.endsWith('next call'));
});
