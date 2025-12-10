import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';

test('DOM Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_DOM === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/libxml/libxml2.so`, ini: false },
			`./packages/dom/php${process.env.PHP_VERSION ?? '8.4'}-dom.so`,
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('dom'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('DOM Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_DOM === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../libxml/libxml2.so`, import.meta.url), ini: false },
			new URL(`../../dom/php${process.env.PHP_VERSION ?? '8.4'}-dom.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('dom'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('DOM Extension is enabled (loaded via module).', async () => {
	const php = env.WITH_DOM === 'dynamic'
		? new PhpNode({sharedLibs:[ libxml, dom ]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('dom'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('DOM Extension is enabled (loaded via async module).', async () => {
	const php = env.WITH_DOM === 'dynamic'
		? new PhpNode({sharedLibs:[ await import('php-wasm-libxml'), await import('php-wasm-dom') ]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('dom'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

