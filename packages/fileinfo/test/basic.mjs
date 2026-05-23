import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import fileinfo from 'php-wasm-fileinfo';

test('Fileinfo Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_FILEINFO === 'dynamic'
		? new PhpNode({sharedLibs:[
			`./packages/fileinfo/php${process.env.PHP_VERSION ?? '8.4'}-fileinfo.so`
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('fileinfo'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Fileinfo Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_FILEINFO === 'dynamic'
		? new PhpNode({sharedLibs:[
			new URL(`../../fileinfo/php${process.env.PHP_VERSION ?? '8.4'}-fileinfo.so`, import.meta.url)
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('fileinfo'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Fileinfo Extension is enabled. (static module loader)', async () => {
	const php = env.WITH_FILEINFO === 'dynamic'
		? new PhpNode({sharedLibs:[fileinfo]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('fileinfo'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Fileinfo Extension is enabled. (dynamic import)', async () => {
	const php = env.WITH_FILEINFO === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-fileinfo')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run('<?php $finfo = finfo_open(FILEINFO_MIME_TYPE); echo finfo_buffer($finfo, "GIF89a"); finfo_close($finfo);');

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `image/gif`);
	assert.equal(stdErr, '');
});
