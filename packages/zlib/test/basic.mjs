import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import zlib from 'php-wasm-zlib';

test('Zlib Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_ZLIB === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/zlib/libz.so`, ini: false },
			{ url: `./packages/zlib/php${process.env.PHP_VERSION ?? '8.4'}-zlib.so`, ini: true },
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zlib'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Zlib Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_ZLIB === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../zlib/libz.so`, import.meta.url), ini: false },
			new URL(`../../zlib/php${process.env.PHP_VERSION ?? '8.4'}-zlib.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zlib'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Zlib Extension is enabled. (loaded via module)', async () => {
	const php = env.WITH_ZLIB === 'dynamic'
		? new PhpNode({sharedLibs:[zlib]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zlib'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Zlib Extension is enabled. (loaded via async module)', async () => {
	const php = env.WITH_ZLIB === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-zlib')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zlib'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
