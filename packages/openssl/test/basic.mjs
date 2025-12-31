import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import openssl from 'php-wasm-openssl';

test('OpenSSL Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_OPENSSL === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: `./packages/openssl/libcrypto.so`, ini: false },
			{ url: `./packages/openssl/libssl.so`, ini: false },
			`./packages/openssl/php${process.env.PHP_VERSION ?? '8.4'}-openssl.so`,
		]})
		: new PhpNode;
	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('openssl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('OpenSSL Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_OPENSSL === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: new URL(`../../openssl/libcrypto.so`, import.meta.url), ini: false },
			{ url: new URL(`../../openssl/libssl.so`, import.meta.url), ini: false },
			new URL(`../../openssl/php${process.env.PHP_VERSION ?? '8.4'}-openssl.so`, import.meta.url),
		]})
		: new PhpNode;
	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('openssl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('OpenSSL Extension is enabled. (loaded via module)', async () => {
	const php = env.WITH_OPENSSL === 'dynamic'
		? new PhpNode({sharedLibs:[openssl]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('openssl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('OpenSSL Extension is enabled (loaded via async module).', async () => {
	const php = env.WITH_OPENSSL === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-openssl')]})
		: new PhpNode;
	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('openssl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('OpenSSL can generate SHA-256 hashes.', async () => {
	const php = env.WITH_OPENSSL === 'dynamic'
		? new PhpNode({sharedLibs:[openssl]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(openssl_digest('Hello, world!', 'SHA256'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `string(64) "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3"\n`);
	assert.equal(stdErr, '');
});
