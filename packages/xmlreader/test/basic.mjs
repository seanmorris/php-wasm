import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../test/lib/PhpNode.mjs';
import { env } from 'node:process';

import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';
import xmlreader from 'php-wasm-xmlreader';

const phpVersion = process.env.PHP_VERSION ?? '8.4';
const isDynamic = flag => env[flag] === 'dynamic';

const stringSharedLibs = [
	isDynamic('WITH_LIBXML') && { url: './packages/libxml/libxml2.so', ini: false },
	isDynamic('WITH_DOM') && `./packages/dom/php${phpVersion}-dom.so`,
	isDynamic('WITH_XMLREADER') && `./packages/xmlreader/php${phpVersion}-xmlreader.so`
].filter(Boolean);

const moduleSharedLibs = [
	isDynamic('WITH_LIBXML') && libxml,
	isDynamic('WITH_DOM') && dom,
	isDynamic('WITH_XMLREADER') && xmlreader
].filter(Boolean);

test('XMLReader Extension is enabled. (loaded via strings)', async () => {
	const php = stringSharedLibs.length
		? new PhpNode({ sharedLibs: stringSharedLibs })
		: new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('xmlreader'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('XMLReader Extension is enabled. (loaded via module)', async () => {
	const php = moduleSharedLibs.length
		? new PhpNode({ sharedLibs: moduleSharedLibs })
		: new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('xmlreader'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
