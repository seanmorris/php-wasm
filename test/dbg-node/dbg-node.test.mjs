import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PhpDbgNode } from '../../packages/php-dbg-wasm/PhpDbgNode.mjs';

const version = process.env.PHP_VERSION ?? '8.4';
const scriptPath = '/preload/test_www/hello-world.php';

const preloadFiles = [
	{
		parent: '/preload/test_www/'
		, name: 'hello-world.php'
		, url: new URL('../browser/fixtures/scripts/hello-world.php', import.meta.url)
	}
];

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

const waitForStdinRequest = (php, label) => new Promise((resolve, reject) => {
	const timer = setTimeout(() => {
		reject(new Error(`Timed out waiting for phpdbg input (${label}).`));
	}, 15000);

	php.addEventListener('stdin-request', event => {
		clearTimeout(timer);
		resolve(event);
	}, {once: true});
});

test(`boots phpdbg in Node for PHP ${version}`, async () => {
	const php = new PhpDbgNode({files: preloadFiles, version});
	const {stdOut, stdErr} = attachOutput(php);

	const bootPrompt = waitForStdinRequest(php, 'boot');
	const process = php.run();

	await bootPrompt;

	const readyPrompt = waitForStdinRequest(php, 'ready');

	await php.provideInput(`exec ${scriptPath}`);
	await php.provideInput('set pagination off');

	await readyPrompt;

	const prompt = await php.getPrompt();

	await php.provideInput('quit');

	const exitCode = await process.catch(error => {
		if(error && typeof error === 'object' && 'status' in error)
		{
			return error.status;
		}

		throw error;
	});

	assert.match(prompt, /prompt>/i);
	assert.match(stdOut(), /\[Set execution context: \/preload\/test_www\/hello-world\.php\]/);
	assert.match(stdOut(), /\[Successful compilation of \/preload\/test_www\/hello-world\.php\]/);
	assert.equal(stdErr(), '');
	assert.equal(exitCode, 0);
});
