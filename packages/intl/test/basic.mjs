import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import intl from 'php-wasm-intl';

console.log(`./packages/intl/php${process.env.PHP_VERSION}-intl.so`);

test('Intl Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({
			sharedLibs: [
				{ url: `./packages/intl/libicudata.so`, ini: false },
				{ url: `./packages/intl/libicui18n.so`, ini: false },
				{ url: `./packages/intl/libicuio.so`, ini: false },
				{ url: `./packages/intl/libicutest.so`, ini: false },
				{ url: `./packages/intl/libicutu.so`, ini: false },
				{ url: `./packages/intl/libicuuc.so`, ini: false },
				`./packages/intl/php${process.env.PHP_VERSION}-intl.so`,
			]
			, files: [{parent: '/preload/', name: 'icudt72l.dat', url: './packages/intl/icudt72l.dat'}]
		})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('intl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Intl Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({
			sharedLibs: [
				{ url: new URL(`../../intl/libicudata.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicui18n.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicuio.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicutest.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicutu.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicuuc.so`, import.meta.url), ini: false },
				new URL(`../../intl/php${process.env.PHP_VERSION}-intl.so`, import.meta.url),
			]
			, files: [{parent: '/preload/', name: 'icudt72l.dat', url: './packages/intl/icudt72l.dat'}]
		})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('intl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Intl can format numbers. (loaded via URL objects)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({
			sharedLibs: [
				{ url: new URL(`../../intl/libicudata.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicui18n.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicuio.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicutest.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicutu.so`, import.meta.url), ini: false },
				{ url: new URL(`../../intl/libicuuc.so`, import.meta.url), ini: false },
				new URL(`../../intl/php${process.env.PHP_VERSION}-intl.so`, import.meta.url),
			]
			, files: [{parent: '/preload/', name: 'icudt72l.dat', url: './packages/intl/icudt72l.dat'}]
		})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php
		$formatter = new \NumberFormatter("en-US", \NumberFormatter::CURRENCY);
		var_dump($formatter->format(100.00));
	`);

	assert.equal(stdErr, '');
	assert.equal(stdOut, `string(7) "$100.00"\n`);
	assert.equal(exitCode, 0);

});

test('Intl Extension is enabled. (loaded via module)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs: [intl]})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('intl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Intl can format numbers. (loaded via module)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs: [intl]})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php
		$formatter = new \NumberFormatter("en-US", \NumberFormatter::CURRENCY);
		var_dump($formatter->format(100.00));
	`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `string(7) "$100.00"\n`);
	assert.equal(stdErr, '');
});

test('Intl Extension is enabled. (dynamic module loader)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs: [ await import('php-wasm-intl') ]})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('intl'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Intl can format numbers. (dynamic module loader)', async () => {
	const php = env.WITH_INTL === 'dynamic'
		? new PhpNode({sharedLibs: [ await import('php-wasm-intl') ]})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php
		$formatter = new \NumberFormatter("en-US", \NumberFormatter::CURRENCY);
		var_dump($formatter->format(100.00));
	`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `string(7) "$100.00"\n`);
	assert.equal(stdErr, '');
});
