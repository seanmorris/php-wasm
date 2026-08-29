import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../test/lib/PhpNode.mjs';
import { env } from 'node:process';

import zlib from 'php-wasm-zlib';
import zip from 'php-wasm-libzip';

test('Zip Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_LIBZIP === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/zlib/libz.so`, ini: false },
			`./packages/zlib/php${process.env.PHP_VERSION ?? '8.4'}-zlib.so`,
			{ url: `./packages/libzip/libzip.so`, ini: false },
			`./packages/libzip/php${process.env.PHP_VERSION ?? '8.4'}-zip.so`,
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zip'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Zip Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_LIBZIP === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../zlib/libz.so`, import.meta.url), ini: false },
			new URL(`../../zlib/php${process.env.PHP_VERSION ?? '8.4'}-zlib.so`, import.meta.url),
			{ url: new URL(`../../libzip/libzip.so`, import.meta.url), ini: false },
			new URL(`../../libzip/php${process.env.PHP_VERSION ?? '8.4'}-zip.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zip'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Zip Extension is enabled. (loaded via module)', async () => {
	const php = env.WITH_LIBZIP === 'dynamic'
		? new PhpNode({sharedLibs:[zlib, zip]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zip'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Zip Extension is enabled. (loaded via async module)', async () => {
	const php = env.WITH_LIBZIP === 'dynamic'
		? new PhpNode({sharedLibs:[
			await import('php-wasm-zlib')
			, await import('php-wasm-libzip')
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('zip'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('ZipArchive creates and extracts an archive through the dynamic libzip API', async () => {
	const php = env.WITH_LIBZIP === 'dynamic'
		? new PhpNode({sharedLibs:[zlib, zip]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php
		var_dump(extension_loaded('zlib'));

		$archive = new ZipArchive();
		var_dump($archive->open('/tmp/archive.zip', ZipArchive::CREATE));
		var_dump($archive->addFromString('hello.txt', 'Hello from libzip!'));
		var_dump($archive->close());

		$archive = new ZipArchive();
		var_dump($archive->open('/tmp/archive.zip'));
		var_dump($archive->extractTo('/tmp/unpacked'));
		$archive->close();
		echo file_get_contents('/tmp/unpacked/hello.txt'), "\n";
	`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, [
		'bool(true)'
		, 'bool(true)'
		, 'bool(true)'
		, 'bool(true)'
		, 'bool(true)'
		, 'bool(true)'
		, 'Hello from libzip!'
		, ''
	].join('\n'));
	assert.equal(stdErr, '');
});
