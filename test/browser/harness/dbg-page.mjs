import { PhpDbgWeb } from '/packages/php-dbg-wasm/PhpDbgWeb.mjs';

import {
	appendStderr,
	appendStdout,
	libType,
	createIni,
	fixtureUrl,
	loadFixtureScript,
	preloadFiles,
	query,
	runtimeVersion,
	setMeta,
	setStatus,
} from './common.mjs';
import { loadDbgSharedLibs } from './runtime-libs.mjs';

const startPath = query.get('path') ?? '/preload/test_www/hello-world.php';
const inspect = query.get('inspect') === '1';
const files = inspect
	? [
		...preloadFiles
		, {
			parent: '/preload/test_www/'
			, name: 'phpdbg-inspection.php'
			, url: fixtureUrl('phpdbg-inspection.php')
		}
		, {
			parent: '/preload/test_www/'
			, name: 'phpdbg-inspection-include.php'
			, url: fixtureUrl('phpdbg-inspection-include.php')
		}
	]
	: preloadFiles;

const waitForPrompt = async php => {
	const start = Date.now();

	while(Date.now() - start < 30000)
	{
		const prompt = await php.getPrompt().catch(() => '');

		if(/prompt>/i.test(prompt))
		{
			return;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error('Timed out waiting for phpdbg prompt.');
};

const waitForBreakpoint = async (php, breakpointLine) => {
	const start = Date.now();
	let lastState = {};

	while(Date.now() - start < 30000)
	{
		const [isExecuting, currentFile, currentLine, breakpointCount] = await Promise.all([
			php.isExecuting().catch(() => 0)
			, php.currentFile().catch(() => '')
			, php.currentLine().catch(() => 0)
			, php.bpCount().catch(() => 0)
		]);

		lastState = {isExecuting, currentFile, currentLine, breakpointCount};

		if(
			isExecuting
			&& currentFile === startPath
			&& currentLine === breakpointLine
			&& breakpointCount === 1
		) {
			return;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error(`Timed out waiting for phpdbg breakpoint: ${JSON.stringify(lastState)}`);
};

const inspectBreakpoint = async php => {
	const [variables, globals, constants, functions, classes, files, backtrace] = await Promise.all([
		php.dumpVars()
		, php.dumpGlobals()
		, php.dumpConstants()
		, php.dumpFunctions()
		, php.dumpClasses()
		, php.dumpFiles()
		, php.dumpBacktrace()
	]);

	const oldFrame = await php.switchFrame(1);
	const outerVariables = await php.dumpVars();
	const restoredFrame = await php.switchFrame(oldFrame);

	return {
		currentFile: await php.currentFile()
		, currentLine: await php.currentLine()
		, breakpointCount: await php.bpCount()
		, isExecuting: Boolean(await php.isExecuting())
		, isRunning: Boolean(await php.isRunning())
		, variables: {
			argument: variables.argument
			, localString: variables.localString
			, localNumber: variables.localNumber
			, localBoolean: variables.localBoolean
			, localNull: variables.localNull
			, arrayAnswer: variables.localArray.nested.answer
			, objectLabel: variables.localObject.label
			, globalReference: variables.phpdbgInspectionGlobal
		}
		, hasServerSuperglobal: Boolean(globals._SERVER)
		, constants: {
			main: constants.PHPDBG_INSPECTION_CONSTANT
			, included: constants.PHPDBG_INCLUDED_CONSTANT
		}
		, functions: {
			inner: functions.phpdbg_inspection_inner
			, included: functions.phpdbg_inspection_included_function
		}
		, classes: {
			class: classes.PhpDbgInspectionClass
			, interface: classes.PhpDbgInspectionContract
			, trait: classes.PhpDbgInspectionTrait
			, included: classes.PhpDbgIncludedClass
		}
		, files
		, backtrace
		, frames: {
			oldFrame
			, outerValue: outerVariables.outerValue
			, restoredFrame
		}
	};
};

const main = async () => {
	setStatus('loading');

	const php = new PhpDbgWeb({
		files
		, ini: createIni()
		, persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
		, sharedLibs: loadDbgSharedLibs(libType)
		, version: runtimeVersion
	});

	php.addEventListener('output', event => appendStdout(event.detail));
	php.addEventListener('error', event => appendStderr(event.detail));

	const updatePromptState = async () => {
		setMeta('prompt', await php.getPrompt());
		setMeta('current-file', await php.currentFile());
		setMeta('current-line', await php.currentLine());
	};

	const startup = new Promise((resolve, reject) => {
		let started = false;

		const runStartupCommand = async command => {
			await php.provideInput(command);
			await updatePromptState();
		};

		const startRuntime = async () => {
			if(started)
			{
				return;
			}

			started = true;

			try
			{
				let breakpointLine = 0;

				if(inspect)
				{
					const source = await loadFixtureScript('phpdbg-inspection.php');
					breakpointLine = source
						.split(/\r?\n/)
						.findIndex(line => line.includes('PHPDBG_INSPECTION_BREAKPOINT')) + 1;

					if(!breakpointLine)
					{
						throw new Error('Inspection fixture breakpoint marker is missing.');
					}
				}

				if(startPath)
				{
					await runStartupCommand(`exec ${startPath}`);
				}

				await runStartupCommand('set pagination off');

				if(inspect)
				{
					await runStartupCommand(`break ${startPath}:${breakpointLine}`);
					await runStartupCommand('run');
					await waitForBreakpoint(php, breakpointLine);
					setMeta('inspection', JSON.stringify(await inspectBreakpoint(php)));
					await updatePromptState();
				}

				setStatus('ready');
				resolve();
			}
			catch(error)
			{
				reject(error);
			}
		};

		php.addEventListener('stdin-request', () => {
			void updatePromptState();
		});

		php.addEventListener('stdin-request', () => {
			void startRuntime();
		}, {once: true});

		void waitForPrompt(php)
			.then(() => startRuntime())
			.catch(reject);
	});

	const process = php.run();

	await startup;
	await process;
};

main().catch(error => {
	appendStderr([`${String(error)}\n`]);
	setStatus('failed');
	throw error;
});
