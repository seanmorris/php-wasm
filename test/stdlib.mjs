import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const phpVersion = process.env.PHP_VERSION ?? '8.4';

if(['8.4', '8.3', '8.2',].includes(phpVersion)) {
	const { microtime, date, sprintf, json_decode } = await import(`../packages/php-wasm/stdlib/${phpVersion}-node.mjs`);

	test('Can use PHP functions that return NUMBERS in JS', () => {
		assert.ok(Math.abs(microtime(true), (Date.now() / 1000) < 0.01));
	});

	test('Can use PHP functions that return STRINGS in JS', () => {
		assert.equal( date('Y-m-d h:i:s', 0), '1970-01-01 12:00:00' );
		assert.equal( sprintf('A %s is %d %s.', 'dozen', 12, 'eggs'), 'A dozen is 12 eggs.');
	});

	test('Can use PHP functions that return OBJECTS in JS', () => {
		const x = json_decode(JSON.stringify({a: 'test'}));
		assert.equal( x.a, 'test' );
	});

	test('Can use PHP functions that return ARRAYS in JS', () => {
		const x = json_decode(JSON.stringify([0,1,2]));

		assert.equal( x[0], 0 );
		assert.equal( x[1], 1 );
		assert.equal( x[2], 2 );
	});

	test('Can use PHP functions that return ASSOC ARRAYS in JS', () => {
		const x = json_decode(JSON.stringify({"a": 1}), 1);

		assert.equal( x["a"], 1 );
	});
}
