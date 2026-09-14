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

test('Vrzno property checks follow PHP null and truthiness semantics', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;

	const subject = {
		nil: null,
		undef: undefined,
		zero: 0,
		stringZero: '0',
		emptyString: '',
		falsy: false,
		truthy: true,
	};

	const exitCode = await php.r`<?php
		$value = ${subject};
		echo json_encode([
			'issetNil' => isset($value->nil),
			'issetUndefined' => isset($value->undef),
			'issetMissing' => isset($value->missing),
			'issetZero' => isset($value->zero),
			'existsNil' => property_exists($value, 'nil'),
			'existsUndefined' => property_exists($value, 'undef'),
			'existsMissing' => property_exists($value, 'missing'),
			'emptyZero' => empty($value->zero),
			'emptyStringZero' => empty($value->stringZero),
			'emptyString' => empty($value->emptyString),
			'emptyFalse' => empty($value->falsy),
			'emptyTrue' => empty($value->truthy),
		]);`;

	assert.equal(exitCode, 0);
	assert.deepEqual(JSON.parse(output.stdout()), {
		issetNil: false,
		issetUndefined: false,
		issetMissing: false,
		issetZero: true,
		existsNil: true,
		existsUndefined: true,
		existsMissing: false,
		emptyZero: true,
		emptyStringZero: true,
		emptyString: true,
		emptyFalse: true,
		emptyTrue: false,
	});
	assert.equal(output.stderr(), '');
});

test('PHP arrays preserve present null values when exposed to JavaScript', async () => {
	const php = new PhpNode();
	await php.binary;

	const value = await php.x`['nil' => null, 'zero' => 0, 'falsy' => false]`;

	assert.equal(value.nil, null);
	assert.equal(value.zero, 0);
	assert.equal(value.falsy, false);
	assert.equal(value.missing, undefined);
	assert.equal('nil' in value, true);
	assert.equal('missing' in value, false);
	assert.deepEqual(Object.keys(value).sort(), ['falsy', 'nil', 'zero']);
});

test('PHP array keys retain canonical integer and string distinctions', async () => {
	const php = new PhpNode();
	await php.binary;

	const value = await php.x`[
		-1 => 'negative',
		0 => 'zero',
		'' => 'empty',
		'01' => 'leading',
		'1.0' => 'decimal',
	]`;

	assert.equal(value[-1], 'negative');
	assert.equal(value[0], 'zero');
	assert.equal(value[''], 'empty');
	assert.equal(value['01'], 'leading');
	assert.equal(value['1.0'], 'decimal');
});

test('PHP array iteration follows insertion order across associative keys', async () => {
	const php = new PhpNode();
	await php.binary;

	const value = await php.x`[
		'first' => 1,
		5 => 2,
		'last' => 3,
	]`;

	assert.deepEqual([...value], [1, 2, 3]);
});

test('PHP array proxies expose a valid length descriptor', async () => {
	const php = new PhpNode();
	await php.binary;

	const value = await php.x`['first', 'second']`;

	assert.deepEqual(Object.getOwnPropertyDescriptor(value, 'length'), {
		value: 2,
		writable: false,
		enumerable: false,
		configurable: true,
	});
});

test('PHP array callables retain their object binding in JavaScript', async () => {
	const php = new PhpNode();
	await php.binary;

	const callback = await php.x`(function () {
		class VrznoCallableFixture {
			public function __construct(private int $factor) {}
			public function multiply(int $value): int { return $this->factor * $value; }
		}

		$fixture = new VrznoCallableFixture(3);
		return [$fixture, 'multiply'];
	})()`;

	assert.equal(callback(4), 12);
});

test('PHP methods stay bound to the object that exposed them', async () => {
	const php = new PhpNode();
	await php.binary;

	const pair = await php.x`(function () {
		class VrznoBindingFixture {
			public function __construct(private string $value) {}
			public function value(): string { return $this->value; }
		}

		return [
			new VrznoBindingFixture('first'),
			new VrznoBindingFixture('second'),
		];
	})()`;

	assert.equal(pair[0].value(), 'first');
	assert.equal(pair[1].value(), 'second');
});

test('Vrzno supports scalar, string-key, append, and unset dimension writes', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;

	const target = [];
	const exitCode = await php.r`<?php
		$value = ${target};
		$value[] = 'first';
		$value[2] = 42;
		$value['label'] = null;
		$value['enabled'] = false;
		unset($value[2]);`;

	assert.equal(exitCode, 0);
	assert.equal(target[0], 'first');
	assert.equal(2 in target, false);
	assert.equal(target.label, null);
	assert.equal(target.enabled, false);
	assert.equal(output.stderr(), '');
});

test('Non-finite and out-of-range JavaScript numbers become PHP floats', async () => {
	const php = new PhpNode();
	await php.binary;

	assert.ok(Number.isNaN(await php.x`${NaN}`));
	assert.equal(await php.x`${Infinity}`, Infinity);
	assert.equal(await php.x`${-Infinity}`, -Infinity);
	assert.equal(await php.x`${2147483648}`, 2147483648);
});

test('Strings preserve embedded null bytes in both directions', async () => {
	const php = new PhpNode();
	await php.binary;

	assert.equal(await php.x`${'hello\0world'}`, 'hello\0world');
	assert.equal(await php.x`'hello' . chr(0) . 'world'`, 'hello\0world');
});

test('Vrzno values cannot be cloned or serialized', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;

	const exitCode = await php.r`<?php
		$value = new Vrzno;
		foreach (['clone', 'serialize'] as $operation) {
			try {
				$operation === 'clone' ? clone $value : serialize($value);
				echo 'unexpected';
			} catch (Throwable $error) {
				echo get_class($error), "\n";
			}
		}`;

	assert.equal(exitCode, 0);
	assert.equal(output.stdout(), 'Error\nException\n');
	assert.equal(output.stderr(), '');
});
