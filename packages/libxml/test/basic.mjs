import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode as BasePhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';

class PhpNode extends BasePhpNode
{
	constructor(args = {})
	{
		super(nodeRuntimeOptions(args));
	}
}

test('libXML Extension is enabled.', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('libxml'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});
