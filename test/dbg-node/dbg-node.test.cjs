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
	// An anonymous class's name continues past a NUL byte with the file and
	// line that declare it, which tells one such class from another.
	assert.match(described.localAnonymous.className, /^class@anonymous\0.*phpdbg-inspection\.php:\d+\$[0-9a-f]+$/);
	// The breakpoint line has not run yet, so its variable exists without a value.
	assert.equal(described.breakpointValue.type, 'undefined');
	assert.equal(described.phpdbgInspectionGlobal.reference, true);
	assert.equal(described.localString.reference, false);

	const nestedArray = await php.describeValue(variables.localArray.nested);
	const nestedRatio = await php.describeChild(variables.localArray.nested, 'ratio');
	const objectLabel = await php.describeChild(variables.localObject, 'label');

	assert.deepEqual([nestedArray.type, nestedArray.className, nestedArray.count], ['array', null, 2]);
	// A child keeps its own type: 2.0 would read as an int once it is a JavaScript number.
	assert.deepEqual([nestedRatio.type, nestedRatio.value], ['float', 2]);
	assert.equal((await php.describeValue(variables.localArray.nested.ratio)).type, 'int');
	assert.deepEqual([objectLabel.type, objectLabel.count, objectLabel.value], ['string', 12, 'object-value']);

	// A key can share its name with a property of the JavaScript stand-in for
	// the array. The child is the PHP element, not that property.
	const lookalike = variables.localLookalike;
	const lengthChild = await php.describeChild(lookalike, 'length');
	const constructorChild = await php.describeChild(lookalike, 'constructor');

	assert.deepEqual([lengthChild.type, lengthChild.value], ['string', 'data']);
	assert.deepEqual([constructorChild.type, constructorChild.value], ['float', 1]);

	// Private and protected properties are stored under PHP's mangled names,
	// which contain NUL bytes.
	const hidden = await php.describeChild(variables.localSealed, '\0PhpDbgInspectionSealed\0hidden');
	const guarded = await php.describeChild(variables.localSealed, '\0*\0guarded');
	const open = await php.describeChild(variables.localSealed, 'open');

	assert.deepEqual([hidden.type, hidden.value], ['float', 4]);
	assert.deepEqual([guarded.type, guarded.value], ['string', 'guarded-value']);
	assert.deepEqual([open.type, open.value], ['int', 7]);

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

test('reads the debugger API version without calling a missing export', () => {
	// Stands in for a runtime built with assertions: ccall() on an export
	// that does not exist aborts it, and catching the error does not undo that.
	const runtime = exports => {
		const php = {
			aborted: false
			, ccall: name => {
				if(!exports.includes(name))
				{
					php.aborted = true;

					throw new Error(`Aborted(Assertion failed: Cannot call unknown function ${name})`);
				}

				return 2;
			}
		};

		return php;
	};
	const versionOf = php => {
		const wrapper = Object.create(PhpDbgNode.prototype);

		wrapper.dbgApiVersion = null;

		return wrapper._dbgApiVersion(php);
	};

	const legacy = runtime([]);

	assert.equal(versionOf(legacy), 1);
	assert.equal(legacy.aborted, false, 'the probe aborted a runtime whose Vrzno has no version export');

	// Vrzno linked into the runtime exports the function on the module.
	const linked = runtime(['vrzno_dbg_api_version']);

	linked._vrzno_dbg_api_version = () => 2;
	assert.equal(versionOf(linked), 2);

	// Vrzno loaded as a side module is reached through the symbol resolver.
	const loaded = runtime(['vrzno_dbg_api_version']);

	loaded.resolveGlobalSymbol = name => ({sym: name === 'vrzno_dbg_api_version' ? () => 2 : undefined, name});
	assert.equal(versionOf(loaded), 2);
	assert.equal(loaded.aborted, false);
});

test(`exports the phpdbg symbols a side-module Vrzno binds in Node for PHP ${version}`, async () => {
	// Vrzno's debugger code holds weak references to these. Linked into the
	// runtime they bind at link time; loaded as a side module they bind through
	// the dynamic linker, which finds exported symbols only. Unexported, they
	// are null there: no superglobals, and switchFrame() answers -1.
	const php = new PhpDbgNode(nodeRuntimeOptions({runtime: 'dbg', version}));
	const binary = await php.binary;

	assert.equal(typeof binary.resolveGlobalSymbol, 'function');

	for(const name of ['phpdbg_globals', 'phpdbg_restore_frame', 'phpdbg_arm_auto_global'])
	{
		assert.notEqual(binary.resolveGlobalSymbol(name).sym, undefined, `${name} is not exported`);
	}
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

test(`lists the frames switchFrame() selects when an internal function is on the stack in Node for PHP ${version}`, async () => {
	const callbackPath = '/preload/test_www/phpdbg-callback-frames.php';
	const callbackFile = path.join(__dirname, '../browser/fixtures/scripts/phpdbg-callback-frames.php');
	const callbackUrl = pathToFileURL(callbackFile).href;
	const callbackLine = fs.readFileSync(callbackFile, 'utf8')
		.split(/\r?\n/)
		.findIndex(line => line.includes('PHPDBG_CALLBACK_BREAKPOINT')) + 1;

	const php = new PhpDbgNode(nodeRuntimeOptions({
		runtime: 'dbg'
		, files: [{parent: '/preload/test_www/', name: 'phpdbg-callback-frames.php', url: callbackUrl}]
		, version
		, dbgArgs: ['-q']
	}));
	const {stdOut, stdErr} = attachOutput(php);

	const process = php.run();

	await waitForPromptState(
		php,
		stdOut,
		stdErr,
		timeoutForVersion(60000, 30000),
		'boot prompt'
	);

	await php.provideInput(`exec ${callbackPath}`);
	await php.provideInput(`break ${callbackPath}:${callbackLine}`);
	await php.provideInput('run');

	const pauseStart = Date.now();

	while(
		!(await php.isExecuting().catch(() => 0) && await php.currentLine().catch(() => 0) === callbackLine)
		&& Date.now() - pauseStart < timeoutForVersion(45000, 20000)
	) {
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	const frames = await php.dumpBacktrace();

	// array_map()'s own frame runs no PHP code, so it is not a frame to inspect.
	assert.deepEqual(
		frames.map(frame => [frame.frame, frame.className, frame.functionName])
		, [[0, '', 'phpdbg_callback_double'], [1, 'PhpDbgCallbackJob', 'run'], [2, '', '']]
	);
	assert.deepEqual(frames.map(frame => frame.filename), [callbackPath, callbackPath, callbackPath]);

	// Every listed index selects the frame it names, and listing again does not move the selection.
	const frameLocals = [];

	for(const frame of frames)
	{
		await php.switchFrame(frame.frame);

		frameLocals.push(Object.keys(await php.dumpVars()));

		assert.equal((await php.dumpBacktrace()).findIndex(candidate => candidate.selected), frame.frame);
	}

	assert.ok(frameLocals[0].includes('number'), `callback frame: ${frameLocals[0]}`);
	assert.ok(frameLocals[1].includes('items'), `method frame: ${frameLocals[1]}`);
	assert.ok(frameLocals[2].includes('phpdbgCallbackJob'), `top-level frame: ${frameLocals[2]}`);

	await php.switchFrame(0);
	await php.provideInput('continue');

	const completionStart = Date.now();

	while(!stdOut().includes('callback-complete:42') && Date.now() - completionStart < 20000)
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

	assert.ok(stdOut().includes('callback-complete:42'));
	assert.equal(stdErr(), '');
});

test(`lists PHP frames while an internal function is waiting in Node for PHP ${version}`, async () => {
	const awaitPath = '/preload/test_www/phpdbg-await-frames.php';
	const awaitFile = path.join(__dirname, '../browser/fixtures/scripts/phpdbg-await-frames.php');
	const awaitUrl = pathToFileURL(awaitFile).href;
	const awaitLine = fs.readFileSync(awaitFile, 'utf8')
		.split(/\r?\n/)
		.findIndex(line => line.includes('PHPDBG_AWAIT_LINE')) + 1;

	// PHP waits on this until the test has looked at the stack.
	let release;
	let reportWaiting;
	const waiting = new Promise(resolve => reportWaiting = resolve);
	const gate = {
		then: resolve => {
			release = resolve;
			reportWaiting(true);
		}
	};

	const php = new PhpDbgNode(nodeRuntimeOptions({
		runtime: 'dbg'
		, files: [{parent: '/preload/test_www/', name: 'phpdbg-await-frames.php', url: awaitUrl}]
		, version
		, dbgArgs: ['-q']
		, shared: {phpdbgGate: gate}
	}));
	const {stdOut, stdErr} = attachOutput(php);

	const process = php.run();

	await waitForPromptState(
		php,
		stdOut,
		stdErr,
		timeoutForVersion(60000, 30000),
		'boot prompt'
	);

	await php.provideInput(`exec ${awaitPath}`);
	await php.provideInput('run');

	const timeout = new Promise(resolve => setTimeout(resolve, timeoutForVersion(45000, 20000), false));

	assert.ok(
		await Promise.race([waiting, timeout])
		, formatDiagnostics('to reach vrzno_await()', stdOut, stdErr)
	);

	const frames = await php.dumpBacktrace();

	// vrzno_await()'s own frame runs no PHP code. Frame 0 is the function
	// that called it, at the line of the call.
	assert.deepEqual(
		frames.map(frame => [frame.frame, frame.functionName, frame.filename])
		, [[0, 'phpdbg_await_inner', awaitPath], [1, 'phpdbg_await_outer', awaitPath], [2, '', awaitPath]]
	);
	assert.deepEqual([frames[0].lineNo, frames[0].selected], [awaitLine, true]);

	// The variables shown for a frame are that frame's.
	assert.ok(Object.keys(await php.dumpVars()).includes('label'));
	assert.equal(await php.switchFrame(1), 0);
	assert.ok(Object.keys(await php.dumpVars()).includes('outerLabel'));
	assert.equal((await php.dumpBacktrace()).findIndex(frame => frame.selected), 1);
	assert.equal(await php.switchFrame(0), 1);

	release('released');

	const completionStart = Date.now();

	while(!stdOut().includes('await-complete:released') && Date.now() - completionStart < 20000)
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

	assert.ok(stdOut().includes('await-complete:released'));
	assert.equal(stdErr(), '');
});
