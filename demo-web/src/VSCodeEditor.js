import './Common.css';
import './Editor.css';
import Header from './Header';
import { getPhpBus } from './phpBus';

import { useEffect, useMemo, useRef } from 'react';
import { useVSCode } from 'vscode-react';
import { PhpDbgBusSession } from './PhpDbgBusSession';
import { createPhpDbgRuntimeArgs } from './phpDbgRuntimeArgs';
import {
	callClientMethodWithRetry
	, createGeneratedLaunchConfigurations
	, GENERATED_FILES_ASSOCIATIONS
	, getAssociatedLanguageId
	, listOpenBreakpointsFor
	, STARTUP_BRIDGE_RETRY_OPTIONS
} from './vscodeBridgeStartup';

const GENERATED_CONFIG_PREFIX = 'PHP DBG Wasm: Current File';

const createLaunchConfig = defaultVersion => ({
	version: '0.2.0'
	, configurations: createGeneratedLaunchConfigurations(defaultVersion)
});

const ensureDebugFiles = async (bus, defaultVersion) => {
	const vscodeDir = await bus.analyzePath('/.vscode');

	if(!vscodeDir.exists)
	{
		await bus.mkdir('/.vscode');
	}

	const launchJson = await bus.analyzePath('/.vscode/launch.json');

	if(!launchJson.exists)
	{
		await bus.writeFile(
			'/.vscode/launch.json'
			, new TextEncoder().encode(JSON.stringify(createLaunchConfig(defaultVersion), null, 2))
		);

		return;
	}

	const existingContent = new TextDecoder().decode(
		await bus.readFile('/.vscode/launch.json')
	);

	let parsedLaunchConfig;

	try
	{
		parsedLaunchConfig = JSON.parse(existingContent);
	}
	catch(error)
	{
		console.warn('Skipping launch.json update because the existing file is not valid JSON.', error);
		return;
	}

	const generatedConfigurations = createGeneratedLaunchConfigurations(defaultVersion);
	const preservedConfigurations = Array.isArray(parsedLaunchConfig.configurations)
		? parsedLaunchConfig.configurations.filter(configuration => {
			const name = String(configuration?.name ?? '');
			return !name.startsWith(GENERATED_CONFIG_PREFIX);
		})
		: [];

	const nextLaunchConfig = {
		...parsedLaunchConfig
		, version: parsedLaunchConfig.version ?? '0.2.0'
		, configurations: [
			...generatedConfigurations
			, ...preservedConfigurations
		]
	};

	const nextContent = JSON.stringify(nextLaunchConfig, null, 2);

	if(nextContent !== existingContent)
	{
		await bus.writeFile(
			'/.vscode/launch.json'
			, new TextEncoder().encode(nextContent)
		);
	}
};

export default function VSCodeEditor()
{
	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const path = query.has('path') ? query.get('path') : false;
	const version = query.get('php') || '8.3';
	const outerOrigin = window.location.origin;
	const innerUrl = useMemo(
		() => new URL(query.get('vscodeUrl') || 'https://oss-code.pages.dev', outerOrigin),
		[outerOrigin, query]
	);
	const adapterRef = useRef(null);
	const listOpenBreakpointsRef = useRef(null);
	const sendDebugAdapterMessageRef = useRef(null);

	const fsHandlers = useMemo(() => ({
		readdir(path) {
			return getPhpBus().then(bus => bus.readdir(path));
		}

		, async readFile(path) {
			const bus = await getPhpBus();
			return Array.from(await bus.readFile(path));
		}

		, analyzePath(path) {
			return getPhpBus().then(bus => bus.analyzePath(path));
		}

		, writeFile(filePath, contents) {
			return getPhpBus().then(bus => bus.writeFile(filePath, new Uint8Array(contents)));
		}

		, rename(...args) {
			return getPhpBus().then(bus => bus.rename(...args));
		}

		, mkdir(...args) {
			return getPhpBus().then(bus => bus.mkdir(...args));
		}

		, unlink(...args) {
			return getPhpBus().then(bus => bus.unlink(...args));
		}

		, rmdir(...args) {
			return getPhpBus().then(bus => bus.rmdir(...args));
		}

		, activate(...args) {
			return args.length ? args[0] : true;
		}
	}), []);

	const dbgHandlers = useMemo(() => ({
		acceptVSCodeMessage(...args) {
			return adapterRef.current.acceptVSCodeMessage(...args);
		}

		, debugSessionStarted(...args) {
			return adapterRef.current.debugSessionStarted(...args);
		}

		, didStartDebugSession(...args) {
			return adapterRef.current.didStartDebugSession(...args);
		}

		, didTerminateDebugSession(...args) {
			return adapterRef.current.didTerminateDebugSession(...args);
		}

		, didChangeActiveDebugSession(...args) {
			return adapterRef.current.didChangeActiveDebugSession(...args);
		}
	}), []);

	const {
		VSCode
		, ready
		, openFile
		, configure
		, listOpenBreakpoints
		, sendDebugAdapterMessage
	} = useVSCode({
		url: innerUrl.href
		, fsHandlers
		, dbgHandlers
	});

	listOpenBreakpointsRef.current = listOpenBreakpoints;
	sendDebugAdapterMessageRef.current = sendDebugAdapterMessage;

	useEffect(() => {
		adapterRef.current = new PhpDbgBusSession({
			runtimeArgs: createPhpDbgRuntimeArgs(version)
			, fs: {
				readFile: path => getPhpBus().then(bus => bus.readFile(path))
			}
			, listOpenBreakpoints: () => {
				return listOpenBreakpointsFor({
					listOpenBreakpoints: listOpenBreakpointsRef.current
				});
			}
			, postMessage: (sessionId, message) => {
				if(typeof sendDebugAdapterMessageRef.current !== 'function')
				{
					throw new TypeError('VS Code debug bridge is not available.');
				}

				return sendDebugAdapterMessageRef.current(sessionId, message);
			}
		});

		return () => {
			adapterRef.current?.dispose();
			adapterRef.current = null;
		};
	}, [version]);

	useEffect(() => {
		let cancelled = false;

		void ready.then(async () => {
			try
			{
				const bus = await getPhpBus();
				await ensureDebugFiles(bus, version);
				await callClientMethodWithRetry(
					{configure}
					, 'configure'
					, [{
						filesAssociations: GENERATED_FILES_ASSOCIATIONS
					}]
					, STARTUP_BRIDGE_RETRY_OPTIONS
				);
			}
			catch(error)
			{
				console.warn('Failed to configure file-bus document associations.', error);
			}

			if(cancelled || !path)
			{
				return;
			}

			try
			{
				await callClientMethodWithRetry(
					{openFile}
					, 'openFile'
					, [path, {
						languageId: getAssociatedLanguageId(path) || undefined
					}]
					, STARTUP_BRIDGE_RETRY_OPTIONS
				);
			}
			catch(error)
			{
				console.error(`Failed to open the requested VS Code file: ${path}`, error);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [configure, openFile, path, ready, version]);

	return (<div className = "editor">
		<div className='bevel'>
			<Header />
			<VSCode className='inset' />
		</div>
	</div>);
}
