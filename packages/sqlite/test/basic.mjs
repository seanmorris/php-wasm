import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import sqlite from 'php-wasm-sqlite';

test('Sqlite3 Extension is enabled.', async () => {
	const php = env.WITH_SQLITE === 'dynamic'
		? new PhpNode({sharedLibs:[`php${PhpNode.phpVersion}-sqlite.so`]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('sqlite3'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('PDO Extension is enabled.', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('PDO'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('PDO_Sqlite Extension is enabled.', async () => {
	const php = process.env.WITH_SQLITE === 'dynamic'
		? new PhpNode({sharedLibs:[`php${PhpNode.phpVersion}-sqlite.so`, `php${PhpNode.phpVersion}-pdo-sqlite.so`]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('pdo_sqlite'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Sqlite3 Extension & PDO_Sqlite is enabled (static module loader).', async () => {
	const php = env.WITH_SQLITE === 'dynamic'
		? new PhpNode({sharedLibs:[sqlite]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	{
		const exitCode = await php.run(`<?php var_dump(extension_loaded('sqlite3'));`);
	
		assert.equal(exitCode, 0);
		assert.equal(stdOut, `bool(true)\n`);
		assert.equal(stdErr, '');
	}

	stdOut = stdErr = '';

	{
		const exitCode = await php.run(`<?php var_dump(extension_loaded('pdo_sqlite'));`);
	
		assert.equal(exitCode, 0);
		assert.equal(stdOut, `bool(true)\n`);
		assert.equal(stdErr, '');
	}
});

test('Sqlite3 Extension & PDO_Sqlite is enabled (dynamic module loader).', async () => {
	const php = env.WITH_SQLITE === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-sqlite')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;
	
	{
		const exitCode = await php.run(`<?php var_dump(extension_loaded('sqlite3'));`);
	
		assert.equal(exitCode, 0);
		assert.equal(stdOut, `bool(true)\n`);
		assert.equal(stdErr, '');
	}

	stdOut = stdErr = '';

	{
		const exitCode = await php.run(`<?php var_dump(extension_loaded('pdo_sqlite'));`);
	
		assert.equal(exitCode, 0);
		assert.equal(stdOut, `bool(true)\n`);
		assert.equal(stdErr, '');
	}
});