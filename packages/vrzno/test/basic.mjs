import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';

// test('Can access JS integers via php.r function.', async () => {

// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const scalarInt = 321;

// 	const exitCode = await php.r`<?php var_dump( ${scalarInt} );`;

// 	assert.equal(exitCode, 0);
// 	assert.equal(stdOut, `int(321)\n`);
// 	assert.equal(stdErr, '');
// });

// test('Can access JS floats via php.r function.', async () => {

// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const scalarInt = 321.123;

// 	const exitCode = await php.r`<?php var_dump( ${scalarInt} );`;

// 	assert.equal(exitCode, 0);
// 	assert.equal(stdOut, `float(321.123)\n`);
// 	assert.equal(stdErr, '');
// });

// test('Can access JS strings via php.r function.', async () => {

// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const scalarString = "this is a string";

// 	const exitCode = await php.r`<?php var_dump( ${scalarString} );`;

// 	assert.equal(exitCode, 0);
// 	assert.equal(stdOut, `string(16) "this is a string"\n`);
// 	assert.equal(stdErr, '');
// });

// test('Can access PHP strings via php.x function.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const scalarString = "this is a string";

// 	const returnValue = await php.x`${scalarString}`;
// 	const returnValueIFFE = await php.x`(function() { return ${scalarString} ; })()`;

// 	assert.equal(returnValue, `this is a string`);
// 	assert.equal(returnValueIFFE, `this is a string`);
// 	assert.equal(stdErr, '');
// });

// test('Can access PHP integers via php.x function.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const scalarInt = 321;

// 	const returnValue = await php.x`${scalarInt}`;
// 	const returnValueIFFE = await php.x`(function() { return ${scalarInt} ; })()`;

// 	assert.equal(returnValue, scalarInt);
// 	assert.equal(returnValueIFFE, scalarInt);
// 	assert.equal(stdErr, '');
// });

// describe('Can access PHP floats via php.x function.', async () => {
// 	test('One float', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';
// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const scalarFloat = 321.123;

// 		const returnValue = await php.x`${scalarFloat}`;
// 		assert.equal(returnValue, scalarFloat);

// 		const returnValueIFFE = await php.x`(function() { return ${scalarFloat} ; })()`;
// 		assert.equal(returnValueIFFE, scalarFloat);

// 		assert.equal(stdErr, '');
// 	});

// 	test('Two floats', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';
// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const scalarFloatA = 1.5;
// 		const scalarFloatB = 2.1;

// 		const returnValue = await php.x`${scalarFloatA} + ${scalarFloatB}`;
// 		assert.equal(returnValue, scalarFloatA + scalarFloatB);

// 		const returnValueIFFE = await php.x`(function() { return ${scalarFloatA} + ${scalarFloatB} ; })()`;
// 		assert.equal(returnValueIFFE, scalarFloatA + scalarFloatB);

// 		assert.equal(stdErr, '');
// 	});
// });

// test('Can access JS callbacks via php.r function.', async () => {

// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	class Thing { getString(){ return "This is a value." } }; // This is a Javascript class

// 	const exitCode = await php.r`<?php var_dump( (new ${ Thing })->getString() );`;

// 	assert.equal(exitCode, 0);
// 	assert.equal(stdOut, `string(16) "This is a value."\n`);
// 	assert.equal(stdErr, '');
// });

// describe('Can access JS classes via php.r function.', async () => {

// 	test('Can access native JS classes via php.r function.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';

// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const exitCode = await php.r`<?php var_dump( (new ${ Date })->getFullYear() );`;

// 		assert.equal(exitCode, 0);
// 		assert.equal(stdOut, `int(${ (new Date).getFullYear() })\n`);
// 		assert.equal(stdErr, '');
// 	});

// 	test('Can access JS user-classes via php.r function.', async () => {
// 		const php = new PhpNode();
// 		await php.binary;

// 		let stdOut = '', stdErr = '';
// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		class Thing { getString(){ return "This is a value." } }; // This is a Javascript class

// 		const exitCode = await php.r`<?php var_dump( (new ${ Thing })->getString() );`;

// 		assert.equal(exitCode, 0);
// 		assert.equal(stdOut, `string(16) "This is a value."\n`);
// 		assert.equal(stdErr, '');
// 	});
// });

// describe('Can access JS classes via php.x function.', async () => {

// 	test('Can access native JS classes via php.x function.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';

// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const returnValue = await php.x`(new ${ Date })->getFullYear()`;

// 		assert.equal(returnValue, (new Date).getFullYear());
// 		assert.equal(stdOut, '');
// 		assert.equal(stdErr, '');
// 	});

// 	test('Can access JS user-classes via php.x function.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';

// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		class Thing { getString(){ return "This is a value." } }; // This is a Javascript class

// 		const returnValue = await php.x`(new ${ Thing })->getString()`;

// 		assert.equal(returnValue, 'This is a value.');
// 		assert.equal(stdOut, '');
// 		assert.equal(stdErr, '');
// 	});
// });

// test('Can access PHP callbacks that return integers via php.x function.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const callback = await php.x`function() { return 321; }`;

// 	const returnValue = callback();

// 	assert.equal(returnValue, 321);
// 	assert.equal(stdErr, '');
// });

// describe('Can access PHP callbacks that return floats via php.x function.', async () => {
// 	test('One callback.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';

// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const callback = await php.x`function() { return 321.123; }`;

// 		const returnValue = callback();

// 		assert.equal(returnValue, 321.123);
// 		assert.equal(stdErr, '');
// 	});

// 	test('Two callbacks.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';

// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;


// 		const callbackB = await php.x`function($a) { return $a + 2; }`;
// 		assert.equal(stdOut, '');
// 		assert.equal(stdErr, '');

// 		const callbackA = await php.x`function($a) { return $a + 1; }`;
// 		assert.equal(stdOut, '');
// 		assert.equal(stdErr, '');

// 		const returnValueA = callbackA(0);
// 		const returnValueB = callbackB(returnValueA);

// 		assert.equal(returnValueA, 1);
// 		assert.equal(returnValueB, 3);
// 	});
// });

// test('Can access PHP callbacks that return single-character strings via php.x function.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const callback = await php.x`function() { return "a"; }`;

// 	const returnValue = callback();

// 	assert.equal(returnValue, "a");
// 	assert.equal(stdErr, '');
// });

// test('Can access PHP callbacks that return multi-character strings via php.x function.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const callback = await php.x`function() { return "abcdefg hijklmn op"; }`;

// 	const returnValue = callback();

// 	assert.equal(returnValue, "abcdefg hijklmn op");
// 	assert.equal(stdOut, '');
// 	assert.equal(stdErr, '');
// });

// describe('Can access PHP callbacks that return objects via php.x function.', async () => {
// 	test('One level deep.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';
// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const callback = await php.x`function() { return (object)["a" => "abcdefg"]; }`;
// 		const returnValue = callback();

// 		assert.equal(returnValue.a, "abcdefg");
// 		assert.equal(stdOut, '');
// 		assert.equal(stdErr, '');
// 	});

// 	test('Two levels deep.', async () => {
// 		const php = new PhpNode();

// 		let stdOut = '', stdErr = '';
// 		php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 		php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 		await php.binary;

// 		const callback = await php.x`function() { return function() { return (object)["a" => "abcdefg"]; }; }`;
// 		const returnValue = callback()();

// 		assert.equal(returnValue.a, "abcdefg");
// 		assert.equal(stdOut, '');
// 		assert.equal(stdErr, '');
// 	});
// });

// test('Can get the date with strtotime() and format it with date().', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	// Get yesterday's date and format in JS...
// 	const yesterday = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
// 	const jsFormatted = `${yesterday.getFullYear()}-${String(1 + yesterday.getMonth()).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')} 13:00:00`;

// 	// Extract the functions from PHP...
// 	const strtotime = await php.x`strtotime(...)`;
// 	const date = await php.x`date(...)`;

// 	// Set the timezone...
// 	await php.x`date_default_timezone_set(${Intl.DateTimeFormat().resolvedOptions().timeZone})`;

// 	// Get yesterday's date and format in PHP...
// 	const phpFormatted = date('Y-m-d H:i:s', strtotime('yesterday 1PM'));

// 	assert.equal(jsFormatted, phpFormatted);

// 	assert.equal(stdOut, '');
// 	assert.equal(stdErr, '');
// });

// test('Can get the date from a native object with strtotime() and format it with date().', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	// Get yesterday's date and format in JS...
// 	const yesterday = new Date();
// 	const jsFormatted = `${yesterday.getFullYear()}-${String(1 + yesterday.getMonth()).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
// 		+ ` ${String(yesterday.getHours()).padStart(2, '0')}:${String(yesterday.getMinutes()).padStart(2, '0')}:${String(yesterday.getSeconds()).padStart(2, '0')}`;

// 	// Set the timezone...
// 	await php.x`date_default_timezone_set(${Intl.DateTimeFormat().resolvedOptions().timeZone})`;

// 	// Create a formateDate callback in PHP...
// 	const formatDate = await php.x`function() {
// 		$nativeJsDateClass = ${Date};
// 		$nativeJsDateObject = new $nativeJsDateClass;
// 		$isoString = $nativeJsDateObject->toISOString();
// 		$timestamp = strtotime($isoString);
// 		$formatted = date('Y-m-d H:i:s', $timestamp);
// 		return $formatted;
// 	}`;

// 	const phpFormatted = formatDate();

// 	assert.equal(jsFormatted, phpFormatted);

// 	assert.equal(stdOut, '');
// 	assert.equal(stdErr, '');
// });

// test('Can use url_fopen with file_get_contents.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const json = JSON.parse(await php.x`file_get_contents('https://jsonplaceholder.typicode.com/users')`);

// 	assert.equal(typeof json, 'object');
// 	assert.equal(Array.isArray(json), true);
// 	assert.equal(json.length, 10);
// });

// test('Can get headers from url_fopen with file_get_contents.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const json = JSON.parse(await php.x`(function(){
// 		file_get_contents('https://jsonplaceholder.typicode.com/users');
// 		return json_encode($http_response_header);
// 	})()`);

// 	assert.equal(typeof json, 'object');
// 	assert.equal(Array.isArray(json), true);
// });

// test('Can use url_fopen with file_get_contents with a context.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const json = JSON.parse(await php.x`(function(){
// 		$opts = ['http' => ['method'  => 'GET']];
// 		$context = stream_context_create($opts);
// 		return file_get_contents('https://jsonplaceholder.typicode.com/users', false, $context);
// 	})()`);

// 	assert.equal(typeof json, 'object');
// 	assert.equal(Array.isArray(json), true);
// 	assert.equal(json.length, 10);
// });

// test('Can use url_fopen with file_get_contents with a context. (POST) ', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const json = JSON.parse(await php.x`(function(){
// 		$opts = ['http' => [
// 			'method'  => 'POST',
// 			'header'  => 'Content-type: application/json',
// 			'content' => json_encode(['UID'=>0]),
// 		]];
// 		$context = stream_context_create($opts);
// 		return file_get_contents('https://jsonplaceholder.typicode.com/users', false, $context);
// 	})()`);

// 	assert.equal(typeof json, 'object');
// 	assert.equal(Array.isArray(json), false);
// });

describe('Can take an object param from PHP with a "length" property.', async () => {
	const php = new PhpNode();

	const testFunc = obj => {
		assert.equal(obj.length, 10);
		return obj;
	};

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const returnValue = await php.x`${testFunc}( [ 'length' => 10 ] )`;

	assert.equal(returnValue.length, 10);
	assert.equal(stdOut, '');
	assert.equal(stdErr, '');
});

// describe('Can call Math.random on globalThis.', async () => {
// 	const php = new PhpNode();

// 	let stdOut = '', stdErr = '';

// 	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
// 	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

// 	await php.binary;

// 	const exitCode = await php.r`<?php
// 		$window = new Vrzno;
// 		$obj = (object)['x' => $window->Math->random];

// 		var_dump($window->Math->random());
// 		var_dump(($obj->x)());
// 	`;

// 	assert.equal(stdOut, '');
// 	assert.equal(stdErr, '');
// 	assert.equal(exitCode, 0);
// });

describe('xyz.', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const returnValue = await php.x`function(){ return (new Vrzno())->Math->random(); }`;

	console.log({returnValue});
	console.log(returnValue());

	// assert.equal(returnValue, 0);
	assert.equal(stdOut, '');
	assert.equal(stdErr, '');
});


//