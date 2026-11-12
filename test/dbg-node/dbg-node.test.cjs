const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { strict: assert } = require('node:assert');
const { test } = require('node:test');

const { PhpDbgNode } = require('php-dbg-wasm/PhpDbgNode');
const { nodeRuntimeOptions } = require('../lib/node-runtime-options.cjs');

const version = process.env.PHP_VERSION ?? '8.4';
const scriptPath = '/preload/test_www/phpdbg-inspection.php';
const includedScriptPath = '/preload/test_www/phpdbg-inspection-include.php';
const legacyBootVersion = '8.1';
const fixturePath = path.join(__dirname, '../browser/fixtures/scripts/phpdbg-inspection.php');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const breakpointLine = fixtureSource
	.split(/\r?\n/)
	.findIndex(line => line.includes('PHPDBG_INSPECTION_BREAKPOINT')) + 1;

const preloadFiles = [
	{
		parent: '/preload/test_www/',
		name: 'phpdbg-inspection.php',
		url: pathToFileURL(fixturePath).href,
	},
	{
		parent: '/preload/test_www/',
		name: 'phpdbg-inspection-include.php',
		url: pathToFileURL(path.join(__dirname, '../browser/fixtures/scripts/phpdbg-inspection-include.php')).href,
	},
];

const attachOutput = php => {
	let stdOut = '';
	let stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	return {
		stdOut: () => stdOut,
		stdErr: () => stdErr,
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

const timeoutForVersion = (legacyTimeoutMs, modernTimeoutMs) => (
	comparePhpVersions(version, legacyBootVersion) < 0
		? legacyTimeoutMs
		: modernTimeoutMs
);

const formatDiagnostics = (label, stdOut, stdErr) => (
	`Timed out waiting for phpdbg ${label}.\nSTDOUT:\n${stdOut() || '[empty]'}\nSTDERR:\n${stdErr() || '[empty]'}`
);

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
			php.isExecuting().catch(() => 0),
			php.currentFile().catch(() => ''),
			php.currentLine().catch(() => 0),
			php.bpCount().catch(() => 0),
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

	const php = new PhpDbgNode(nodeRuntimeOptions({ runtime: 'dbg', files: preloadFiles, version }));
	const { stdOut, stdErr } = attachOutput(php);

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
		php.dumpVars(),
		php.dumpGlobals(),
		php.dumpConstants(),
		php.dumpFunctions(),
		php.dumpClasses(),
		php.dumpFiles(),
		php.dumpBacktrace(),
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

	// Debugger API 2: frame names, PHP types, and globals the frame did not import.
	assert.equal(await php.debuggerApiVersion(), 2, 'the pinned Vrzno lacks debugger API 2');
	assert.deepEqual(backtrace.map(frame => frame.functionName), ['phpdbg_inspection_inner', 'phpdbg_inspection_outer', '']);
	assert.deepEqual(backtrace.map(frame => frame.className), ['', '', '']);

	const described = Object.fromEntries((await php.describeVars()).map(variable => [variable.name, variable]));

	assert.equal(described.localNumber.type, 'int');
	assert.equal(described.localFloat.type, 'float');
	assert.equal(described.localFloat.value, 3);
	assert.deepEqual([described.localString.type, described.localString.count], ['string', 11]);
	assert.equal(described.localBoolean.type, 'bool');
	assert.equal(described.localNull.type, 'null');
	assert.deepEqual([described.localArray.type, described.localArray.count], ['array', 1]);
	assert.deepEqual([described.localObject.type, described.localObject.className], ['object', 'PhpDbgInspectionClass']);
	// The breakpoint line has not run yet, so its variable exists without a value.
	assert.equal(described.breakpointValue.type, 'undefined');
	assert.equal(described.phpdbgInspectionGlobal.reference, true);
	assert.equal(described.localString.reference, false);

	const nestedArray = await php.describeValue(variables.localArray.nested);

	assert.deepEqual([nestedArray.type, nestedArray.className, nestedArray.count], ['array', null, 1]);

	const userGlobals = await php.dumpGlobals({user: true});
	const describedConstants = await php.describeConstants();

	assert.equal(userGlobals.phpdbgInspectionUnimported, 'unimported-global');
	assert.ok(userGlobals._SERVER, 'user globals are listed with superglobals, not instead of them');
	assert.equal(globals.phpdbgInspectionUnimported, undefined);
	assert.equal(describedConstants.find(constant => constant.name === 'PHPDBG_INSPECTION_CONSTANT')?.type, 'string');

	const oldFrame = await php.switchFrame(1);
	const outerVariables = await php.dumpVars();
	const outerBacktrace = await php.dumpBacktrace();
	const withoutSelection = frames => frames.map(({filename, lineNo, frame}) => ({filename, lineNo, frame}));

	assert.equal(oldFrame, 0);
	assert.equal(outerVariables.outerValue, 'outer-value');
	// The backtrace is numbered from the innermost frame whichever frame is
	// selected, and listing it leaves the selection where it was.
	assert.deepEqual(withoutSelection(outerBacktrace), withoutSelection(backtrace));
	assert.deepEqual(backtrace.map(frame => frame.selected), backtrace.map((frame, index) => index === 0));
	assert.deepEqual(outerBacktrace.map(frame => frame.selected), backtrace.map((frame, index) => index === 1));
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
	assert.match(stdOut(), /Welcome to phpdbg/);
	assert.ok(stdOut().includes('inspection-complete:outer-value:local-value:42:true:null:42:object-value:global-value'));
	assert.equal(stdErr(), '');
	assert.equal(exitCode, 0);
});

test(`starts phpdbg without the welcome banner when dbgArgs asks for it in Node for PHP ${version}`, async () => {
	const php = new PhpDbgNode(nodeRuntimeOptions({runtime: 'dbg', files: preloadFiles, version, dbgArgs: ['-q']}));
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

	// Command notices still arrive; only the banner is gone.
	await waitForReadyState(
		php,
		stdOut,
		stdErr,
		timeoutForVersion(45000, 20000)
	);

	// phpdbg registers dl() the way the CLI does.
	await php.provideInput('ev print(function_exists("dl") ? "dl-registered" : "dl-missing")');

	const dlProbeStart = Date.now();

	while(!/dl-(registered|missing)/.test(stdOut()) && Date.now() - dlProbeStart < 20000)
	{
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	await php.provideInput('quit');

	await process.catch(error => {
		if(error && typeof error === 'object' && 'status' in error)
		{
			return error.status;
		}

		throw error;
	});

	assert.doesNotMatch(stdOut(), /Welcome to phpdbg/);
	assert.match(stdOut(), /dl-registered/);
	assert.equal(stdErr(), '');
	assert.throws(() => new PhpDbgNode({version, dbgArgs: '-q'}), /dbgArgs must be an array of strings/);
});
