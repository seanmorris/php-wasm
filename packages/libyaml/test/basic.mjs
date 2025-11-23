import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { env } from 'node:process';

import yaml from 'php-wasm-yaml';

test('Yaml Extension is enabled. (loaded via strings)', async () => {
	const php = env.WITH_YAML === 'dynamic'
		? new PhpNode({sharedLibs:[
			{url: `./packages/libyaml/libyaml.so`, ini: false },
			`./packages/libyaml/php${process.env.PHP_VERSION ?? '8.4'}-yaml.so`,
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('yaml'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Yaml Extension is enabled. (loaded via URL objects)', async () => {
	const php = env.WITH_YAML === 'dynamic'
		? new PhpNode({sharedLibs:[
			{url: new URL(`../../libyaml/libyaml.so`, import.meta.url), ini: false },
			new URL(`../../libyaml/php${process.env.PHP_VERSION ?? '8.4'}-yaml.so`, import.meta.url),
		]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('yaml'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Yaml Extension is enabled (static module loader).', async () => {
	const php = env.WITH_YAML === 'dynamic'
		? new PhpNode({sharedLibs:[yaml]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('yaml'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Yaml Extension is enabled (dynamic module loader).', async () => {
	const php = env.WITH_YAML === 'dynamic'
		? new PhpNode({sharedLibs:[await import('php-wasm-yaml')]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('yaml'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
