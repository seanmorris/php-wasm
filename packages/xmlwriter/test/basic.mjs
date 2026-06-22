import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../test/lib/PhpNode.mjs';
import { env } from 'node:process';

import libxml from 'php-wasm-libxml';
import xmlwriter from 'php-wasm-xmlwriter';

test('XMLWriter Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_XMLWRITER === 'dynamic'
		? new PhpNode({sharedLibs:[
			{ url: './packages/libxml/libxml2.so', ini: false },
			`./packages/xmlwriter/php${process.env.PHP_VERSION ?? '8.4'}-xmlwriter.so`
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('xmlwriter'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('XMLWriter Extension is enabled. (loaded via module)', async () => {
	const php = env.WITH_XMLWRITER === 'dynamic'
		? new PhpNode({sharedLibs:[libxml, xmlwriter]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('xmlwriter'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
