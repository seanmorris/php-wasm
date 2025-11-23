import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import zlib from 'php-wasm-zlib'
import gd from 'php-wasm-gd'

test('GD Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/gd/libfreetype.so`, ini: false },
			{ url: `./packages/gd/libjpeg.so`, ini: false },
			{ url: `./packages/gd/libpng.so`, ini: false },
			{ url: `./packages/gd/libwebp.so`, ini: false },
			{ url: `./packages/zlib/libz.so`, ini: false },
			`./packages/gd/php${process.env.PHP_VERSION ?? '8.4'}-gd.so`,
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('gd'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('GD Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../gd/libfreetype.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libjpeg.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libpng.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libwebp.so`, import.meta.url), ini: false },
			{ url: new URL(`../../zlib/libz.so`, import.meta.url), ini: false },
			new URL(`../../gd/php${process.env.PHP_VERSION ?? '8.4'}-gd.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('gd'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Function "imagettftext" exists.', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../gd/libfreetype.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libjpeg.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libpng.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libwebp.so`, import.meta.url), ini: false },
			{ url: new URL(`../../zlib/libz.so`, import.meta.url), ini: false },
			new URL(`../../gd/php${process.env.PHP_VERSION ?? '8.4'}-gd.so`, import.meta.url),
		]})
		: new PhpNode;


	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(function_exists('imagettftext'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Function "imagepng" exists.', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../gd/libfreetype.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libjpeg.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libpng.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libwebp.so`, import.meta.url), ini: false },
			{ url: new URL(`../../zlib/libz.so`, import.meta.url), ini: false },
			new URL(`../../gd/php${process.env.PHP_VERSION ?? '8.4'}-gd.so`, import.meta.url),
		]})
		: new PhpNode;


	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(function_exists('imagepng'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Function "imagejpeg" exists.', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../gd/libfreetype.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libjpeg.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libpng.so`, import.meta.url), ini: false },
			{ url: new URL(`../../gd/libwebp.so`, import.meta.url), ini: false },
			{ url: new URL(`../../zlib/libz.so`, import.meta.url), ini: false },
			new URL(`../../gd/php${process.env.PHP_VERSION ?? '8.4'}-gd.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(function_exists('imagejpeg'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('GD Extension is enabled (loaded via module).', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[ zlib, gd ]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('gd'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('GD Extension is enabled (dynamic module loader).', async () => {
	const php = env.WITH_GD === 'dynamic'
		? new PhpNode({sharedLibs:[ await import('php-wasm-zlib'), await import('php-wasm-gd') ]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('gd'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});