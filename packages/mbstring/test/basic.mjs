import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { env } from 'node:process';
import { PhpNode } from '../../../test/lib/PhpNode.mjs';

import mbstring from 'php-wasm-mbstring';

test('Mbstring extension loads with Oniguruma support.', async () => {
	const php = env.WITH_MBSTRING === 'dynamic'
		? new PhpNode({sharedLibs:[mbstring]})
		: new PhpNode;

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php
		var_dump(extension_loaded('mbstring'));
		var_dump(mb_strlen('hé😀', 'UTF-8'));
		var_dump(mb_ereg_match('^hé', 'héllo'));
	`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, "bool(true)\nint(3)\nbool(true)\n");
	assert.equal(stdErr, '');
});
