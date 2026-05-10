import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PhpDbgNode } from '../../packages/php-dbg-wasm/PhpDbgNode.mjs';
import { nodeRuntimeOptions } from '../lib/node-runtime-options.mjs';

const version = process.env.PHP_VERSION ?? '8.4';
const scriptPath = '/preload/test_www/hello-world.php';
const legacyBootVersion = '8.1';

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

const comparePhpVersions = (left, right) => {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);

	for(let index = 0; index < Math.max(leftParts.length, rightParts.length); index++)
	{
		const leftPart = leftParts[index] ?? 0;
		const rightPart = rightParts[index] ?? 0;

		if(leftPart === rightPart)
		{
			continue;
		}

		return leftPart - rightPart;
	}

	return 0;
};

const timeoutForVersion = (legacyTimeoutMs, modernTimeoutMs) => {
	return comparePhpVersions(version, legacyBootVersion) < 0
		? legacyTimeoutMs
		: modernTimeoutMs;
};

const formatDiagnostics = (label, stdOut, stdErr) => {
	return `Timed out waiting for phpdbg ${label}.\nSTDOUT:\n${stdOut() || '[empty]'}\nSTDERR:\n${stdErr() || '[empty]'}`;
};

const waitForPromptState = async (php, stdOut, stdErr, timeoutMs, label) => {
	const start = Date.now();

	while(Date.now() - start < timeoutMs)
	{
		const prompt = await php.getPrompt().catch(() => '');

		if(/prompt>/i.test(prompt))
		{
			return prompt;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error(formatDiagnostics(label, stdOut, stdErr));
};

const waitForReadyState = async (php, stdOut, stdErr, timeoutMs) => {
	const start = Date.now();

	while(Date.now() - start < timeoutMs)
	{
		const prompt = await php.getPrompt().catch(() => '');
		const output = stdOut();

		if(
			/\[Set execution context: \/preload\/test_www\/hello-world\.php\]/.test(output)
			&& /\[Successful compilation of \/preload\/test_www\/hello-world\.php\]/.test(output)
			&& /prompt>/i.test(prompt)
		)
		{
			return prompt;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error(formatDiagnostics('readiness', stdOut, stdErr));
};

test(`boots phpdbg in Node for PHP ${version}`, async () => {
	const php = new PhpDbgNode(nodeRuntimeOptions({files: preloadFiles, version}));
	const {stdOut, stdErr} = attachOutput(php);

	const process = php.run();

	await waitForPromptState(
		php,
		stdOut,
		stdErr,
		timeoutForVersion(60000, 30000),
		'boot prompt'
	);

	await php.provideInput(`exec ${scriptPath}`);
	await php.provideInput('set pagination off');

	const prompt = await waitForReadyState(
		php,
		stdOut,
		stdErr,
		timeoutForVersion(45000, 20000)
	);

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
