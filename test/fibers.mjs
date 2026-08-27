import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PhpNode } from './lib/PhpNode.mjs';

const phpVersion = process.env.PHP_VERSION ?? '8.4';
const source = readFileSync(new URL('./fixtures/fibers.php', import.meta.url), 'utf8');
const expected = phpVersion === '8.0'
	? 'fiber-unavailable:8.0\n'
	: `fibers-ok:${phpVersion}\n`;

test(`Zend Fibers use the Emscripten backend (${phpVersion})`, async () => {
	const php = new PhpNode();
	let stdOut = '';
	let stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	// Running twice on one module exercises main-context setup and teardown for
	// consecutive PHP requests, including its separately owned Asyncify stack.
	for(let invocation = 0; invocation < 2; ++invocation)
	{
		stdOut = '';
		stdErr = '';

		const exitCode = await php.run(source);

		assert.equal(exitCode, 0, `fiber regression invocation ${invocation + 1} failed`);
		assert.equal(stdOut, expected);
		assert.equal(stdErr, '');
	}
});
