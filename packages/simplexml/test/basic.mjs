import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import libxml from 'php-wasm-libxml';
import simplexml from 'php-wasm-simplexml';

test('SimpleXML Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_SIMPLEXML === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/libxml/libxml2.so` },
			`./packages/simplexml/php${process.env.PHP_VERSION ?? '8.4'}-simplexml.so`
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('SimpleXML'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('SimpleXML Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_SIMPLEXML === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../libxml/libxml2.so`, import.meta.url) },
			new URL(`../../simplexml/php${process.env.PHP_VERSION ?? '8.4'}-simplexml.so`, import.meta.url)
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('SimpleXML'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('SimpleXML Extension is enabled. (loaded via module)', async () => {
	const php = env.WITH_SIMPLEXML === 'dynamic'
		? new PhpNode({sharedLibs:[libxml, simplexml]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('SimpleXML'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('SimpleXML Extension is enabled. (loaded via async module)', async () => {
	const php = env.WITH_SIMPLEXML === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-libxml'), await import('php-wasm-simplexml')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('SimpleXML'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
