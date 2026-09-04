import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode as BasePhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';

class PhpNode extends BasePhpNode
{
	constructor(args = {})
	{
		super(nodeRuntimeOptions(args));
	}
}

const capture = php => {
	let stdout = '';
	let stderr = '';
	php.addEventListener('output', event => event.detail.forEach(line => void (stdout += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stderr += line)));
	return {
		stdout: () => stdout,
		stderr: () => stderr,
	};
};

test('Unsupported JavaScript primitives raise catchable PHP TypeErrors', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;

	const bigint = 1n;
	const symbol = Symbol('vrzno');
	const exitCode = await php.r`<?php
		foreach ([
			fn() => ${bigint},
			fn() => ${symbol},
		] as $read) {
			try {
				$read();
			} catch (Throwable $error) {
				echo get_class($error), ':', $error->getMessage(), "\n";
			}
		}`;

	assert.equal(exitCode, 0);
	assert.equal(output.stdout(), [
		'TypeError:Cannot convert JavaScript bigint to PHP',
		'TypeError:Cannot convert JavaScript symbol to PHP',
		'',
	].join('\n'));
	assert.equal(output.stderr(), '');
});

test('JavaScript property, method, and constructor errors become RuntimeExceptions', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;

	const subject = {
		get broken() {
			throw new Error('getter exploded');
		},
		breakThings() {
			throw new Error('method exploded');
		},
	};
	class BrokenConstructor
	{
		constructor()
		{
			throw new Error('constructor exploded');
		}
	}

	const exitCode = await php.r`<?php
		$value = ${subject};
		$constructor = ${BrokenConstructor};

		foreach ([
			fn() => $value->broken,
			fn() => $value->breakThings(),
			fn() => new $constructor,
		] as $operation) {
			try {
				$operation();
			} catch (Throwable $error) {
				echo get_class($error), ':', $error->getMessage(), "\n";
			}
		}`;

	assert.equal(exitCode, 0);
	assert.equal(output.stdout(), [
		'RuntimeException:getter exploded',
		'RuntimeException:method exploded',
		'RuntimeException:constructor exploded',
		'',
	].join('\n'));
	assert.equal(output.stderr(), '');
});

test('Promise rejection and legacy helper errors are catchable RuntimeExceptions', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;

	const rejection = {
		then(resolve, reject) {
			reject(new Error('promise rejected'));
		},
	};
	const exitCode = await php.r`<?php
		try {
			vrzno_await(${rejection});
		} catch (Throwable $error) {
			echo get_class($error), ':', $error->getMessage(), "\n";
		}

		try {
			vrzno_run('__vrzno_missing_global__');
		} catch (Throwable $error) {
			echo get_class($error), ':', $error->getMessage(), "\n";
		}`;

	assert.equal(exitCode, 0);
	assert.equal(output.stdout(), [
		'RuntimeException:promise rejected',
		'RuntimeException:__vrzno_missing_global__ is not a global JavaScript function',
		'',
	].join('\n'));
	assert.equal(output.stderr(), '');
});
