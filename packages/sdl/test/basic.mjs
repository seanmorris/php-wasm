import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';

import sdl from 'php-wasm-sdl';

test('SDL Extension is enabled.', async () => {
	const php = process.env.WITH_SDL === 'dynamic'
		? new PhpNode({sharedLibs:[`php${process.env.PHP_VERSION ?? '8.4'}-sdl.so`]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('sdl'));`);

	const lines = stdOut.split(/\n+/).filter(x => x);
	const lastLine = lines.length && lines[lines.length + -1];

	assert.equal(exitCode, 0);
	assert.equal(lastLine, `bool(true)`);
	assert.equal(stdErr, '');
});

test('SDL Extension is enabled (static module loader).', async () => {
	const php = process.env.WITH_SDL === 'dynamic'
		? new PhpNode({sharedLibs:[sdl]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('sdl'));`);

	const lines = stdOut.split(/\n+/).filter(x => x);
	const lastLine = lines.length && lines[lines.length + -1];

	assert.equal(exitCode, 0);
	assert.equal(lastLine, `bool(true)`);
	assert.equal(stdErr, '');
});

test('SDL Extension is enabled (dynamic module loader).', async () => {
	const php = process.env.WITH_SDL === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-sdl')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('sdl'));`);

	const lines = stdOut.split(/\n+/).filter(x => x);
	const lastLine = lines.length && lines[lines.length + -1];

	assert.equal(exitCode, 0);
	assert.equal(lastLine, `bool(true)`);
	assert.equal(stdErr, '');
});
