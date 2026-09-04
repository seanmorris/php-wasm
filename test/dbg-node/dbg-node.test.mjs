import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { test } from 'node:test';

import { PhpDbgNode } from '../../packages/php-dbg-wasm/PhpDbgNode.mjs';
import { nodeRuntimeOptions } from '../lib/node-runtime-options.mjs';

const version = process.env.PHP_VERSION ?? '8.4';
const scriptPath = '/preload/test_www/phpdbg-inspection.php';
const includedScriptPath = '/preload/test_www/phpdbg-inspection-include.php';
const legacyBootVersion = '8.1';
const fixtureUrl = new URL('../browser/fixtures/scripts/phpdbg-inspection.php', import.meta.url);
const fixtureSource = fs.readFileSync(fixtureUrl, 'utf8');
const breakpointLine = fixtureSource
	.split(/\r?\n/)
	.findIndex(line => line.includes('PHPDBG_INSPECTION_BREAKPOINT')) + 1;

const preloadFiles = [
	{
		parent: '/preload/test_www/'
		, name: 'phpdbg-inspection.php'
		, url: fixtureUrl
	}
	, {
		parent: '/preload/test_www/'
		, name: 'phpdbg-inspection-include.php'
		, url: new URL('../browser/fixtures/scripts/phpdbg-inspection-include.php', import.meta.url)
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
			output.includes(`[Set execution context: ${scriptPath}]`)
			&& output.includes(`[Successful compilation of ${scriptPath}]`)
			&& /prompt>/i.test(prompt)
		) {
			return prompt;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error(formatDiagnostics('readiness', stdOut, stdErr));
};

const waitForBreakpoint = async (php, stdOut, stdErr, timeoutMs) => {
	const start = Date.now();

	while(Date.now() - start < timeoutMs)
	{
		const [isExecuting, currentFile, currentLine, breakpointCount] = await Promise.all([
			php.isExecuting().catch(() => 0)
			, php.currentFile().catch(() => '')
			, php.currentLine().catch(() => 0)
			, php.bpCount().catch(() => 0)
		]);

		if(
			isExecuting
			&& currentFile === scriptPath
			&& currentLine === breakpointLine
			&& breakpointCount === 1
		) {
			return;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error(formatDiagnostics('breakpoint', stdOut, stdErr));
};

test(`inspects a live phpdbg frame in Node for PHP ${version}`, async () => {
	assert.ok(breakpointLine > 0, 'inspection fixture breakpoint marker is missing');

	const php = new PhpDbgNode(nodeRuntimeOptions({runtime: 'dbg', files: preloadFiles, version}));
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

	await php.provideInput(`break ${scriptPath}:${breakpointLine}`);
	await php.provideInput('run');

	await waitForBreakpoint(
		php,
		stdOut,
		stdErr,
		timeoutForVersion(45000, 20000)
	);

	const [variables, globals, constants, functions, classes, files, backtrace] = await Promise.all([
		php.dumpVars()
		, php.dumpGlobals()
		, php.dumpConstants()
		, php.dumpFunctions()
		, php.dumpClasses()
		, php.dumpFiles()
		, php.dumpBacktrace()
	]);

	assert.equal(variables.argument, 'outer-value');
	assert.equal(variables.localString, 'local-value');
	assert.equal(variables.localNumber, 42);
	assert.equal(variables.localBoolean, true);
	assert.equal(variables.localNull, null);
	assert.equal(variables.localArray.nested.answer, 42);
	assert.equal(variables.localObject.label, 'object-value');
	assert.equal(variables.phpdbgInspectionGlobal, 'global-value');

	assert.ok(globals._SERVER, 'superglobals are unavailable');
	assert.equal(constants.PHPDBG_INSPECTION_CONSTANT, 'constant-value');
	assert.equal(constants.PHPDBG_INCLUDED_CONSTANT, 'included-constant-value');

	assert.equal(functions.phpdbg_inspection_inner.name, 'phpdbg_inspection_inner');
	assert.equal(functions.phpdbg_inspection_inner.filename, scriptPath);
	assert.ok(functions.phpdbg_inspection_inner.lineNo > 0);
	assert.equal(functions.phpdbg_inspection_included_function.filename, includedScriptPath);
	assert.equal(classes.PhpDbgInspectionClass.filename, scriptPath);
	assert.equal(classes.PhpDbgInspectionContract.filename, scriptPath);
	assert.equal(classes.PhpDbgInspectionTrait.filename, scriptPath);
	assert.equal(classes.PhpDbgIncludedClass.filename, includedScriptPath);
	assert.ok(files.includes(includedScriptPath), `included files: ${JSON.stringify(files)}`);
	assert.ok(backtrace.length >= 2, 'nested debugger frames are unavailable');
	assert.equal(backtrace[0].filename, scriptPath);
	assert.ok(await php.isRunning(), 'phpdbg did not report an active run');

	const oldFrame = await php.switchFrame(1);
	const outerVariables = await php.dumpVars();

	assert.equal(oldFrame, 0);
	assert.equal(outerVariables.outerValue, 'outer-value');
	assert.equal(await php.switchFrame(oldFrame), 1);

	await php.provideInput('continue');

	const completionStart = Date.now();

	while(!stdOut().includes('inspection-complete:') && Date.now() - completionStart < 20000)
	{
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	await php.provideInput('quit');

	const exitCode = await process.catch(error => {
		if(error && typeof error === 'object' && 'status' in error)
		{
			return error.status;
		}

		throw error;
	});

	assert.match(prompt, /prompt>/i);
	assert.ok(stdOut().includes(`[Set execution context: ${scriptPath}]`));
	assert.ok(stdOut().includes(`[Successful compilation of ${scriptPath}]`));
	assert.ok(stdOut().includes('inspection-complete:outer-value:local-value:42:true:null:42:object-value:global-value'));
	assert.equal(stdErr(), '');
	assert.equal(exitCode, 0);
});
