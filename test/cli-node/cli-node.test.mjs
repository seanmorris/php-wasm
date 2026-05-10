import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PhpCliNode } from '../../packages/php-cli-wasm/PhpCliNode.mjs';
import { nodeRuntimeOptions } from '../lib/node-runtime-options.mjs';

const version = process.env.PHP_VERSION ?? '8.4';

const attachOutput = php => {
	let stdOut = '';
	let stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	return {
		stdOut: () => stdOut
		, stdErr: () => stdErr
	};
};

test('runs a CLI script in Node', async () => {
	const php = new PhpCliNode(nodeRuntimeOptions({
		code: 'echo "Hello, World!";'
		, version
	}));
	const {stdOut, stdErr} = attachOutput(php);

	await php.binary;

	const exitCode = await php.run();

	assert.equal(exitCode, 0);
	assert.equal(stdOut(), 'Hello, World!');
	assert.equal(stdErr(), '');
});

test(`loads the requested CLI runtime version (${version})`, async () => {
	const php = new PhpCliNode(nodeRuntimeOptions({
		code: 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;'
		, version
	}));
	const {stdOut, stdErr} = attachOutput(php);

	await php.binary;

	const exitCode = await php.run();

	assert.equal(exitCode, 0);
	assert.equal(stdOut(), version);
	assert.equal(stdErr(), '');
});
