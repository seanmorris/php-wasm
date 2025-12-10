import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import iconv from 'php-wasm-iconv';

test('Iconv Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/iconv/libiconv.so` },
			`./packages/iconv/php${process.env.PHP_VERSION ?? '8.4'}-iconv.so`,
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('iconv'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Iconv Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../iconv/libiconv.so`, import.meta.url) },
			new URL(`../../iconv/php${process.env.PHP_VERSION ?? '8.4'}-iconv.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('iconv'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Iconv Extension is enabled (loaded via module).', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs:[iconv]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('iconv'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Iconv Extension is enabled (loaded via async module).', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-iconv')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('iconv'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
