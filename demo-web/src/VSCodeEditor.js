import './Common.css';
import './Editor.css';
import Header from './Header';
import { sendMessageFor } from 'php-cgi-wasm/msg-bus.mjs';

import { Client, Server } from 'quickbus';
import { useEffect, useMemo, useRef } from 'react';
import { PhpDbgBusSession } from './PhpDbgBusSession';
import { createPhpDbgRuntimeArgs } from './phpDbgRuntimeArgs';

const sendMessage = sendMessageFor(navigator.serviceWorker.controller);
const SUPPORTED_PHP_VERSIONS = ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];
const GENERATED_CONFIG_PREFIX = 'PHP DBG Wasm: Current File';
const GENERATED_FILES_ASSOCIATIONS = {
	'*.module': 'php'
	, '*.inc': 'php'
};

const getAssociatedLanguageId = path => {
	if(!path)
	{
		return null;
	}

	return Object.entries(GENERATED_FILES_ASSOCIATIONS)
		.find(([pattern]) => {
			const suffix = pattern.startsWith('*.')
				? pattern.slice(1)
				: pattern;

			return path.endsWith(suffix);
		})
		?.[1] ?? null;
};

const createGeneratedLaunchConfigurations = (defaultVersion = '8.3') => {
	const orderedVersions = [
		defaultVersion
		, ...SUPPORTED_PHP_VERSIONS.filter(version => version !== defaultVersion)
	];

	return orderedVersions.map(version => ({
		type: 'dbgBus'
		, request: 'launch'
		, name: `${GENERATED_CONFIG_PREFIX} (PHP ${version})`
		, program: '${file}'
		, version
	}));
};

const createLaunchConfig = defaultVersion => ({
	version: '0.2.0'
	, configurations: createGeneratedLaunchConfigurations(defaultVersion)
});

const ensureDebugFiles = async defaultVersion => {
	const vscodeDir = await sendMessage('analyzePath', ['/.vscode']);

	if(!vscodeDir.exists)
	{
		await sendMessage('mkdir', ['/.vscode']);
	}

	const launchJson = await sendMessage('analyzePath', ['/.vscode/launch.json']);

	if(!launchJson.exists)
	{
		await sendMessage('writeFile', [
			'/.vscode/launch.json'
			, new TextEncoder().encode(JSON.stringify(createLaunchConfig(defaultVersion), null, 2))
		]);

		return;
	}

	const existingContent = new TextDecoder().decode(
		await sendMessage('readFile', ['/.vscode/launch.json'])
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
		await sendMessage('writeFile', [
			'/.vscode/launch.json'
			, new TextEncoder().encode(nextContent)
		]);
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
	const innerOrigin = innerUrl.origin;

	const iframeRef = useRef(null);
	const clientRef = useRef(null);
	const serverRef = useRef(null);
	const adapterRef = useRef(null);

	useEffect(() => {
		if(!iframeRef.current)
		{
			return;
		}

		clientRef.current = new Client({
			to: iframeRef.current.contentWindow
			, from: window
			, origin: innerOrigin
		});

		adapterRef.current = new PhpDbgBusSession({
			runtimeArgs: createPhpDbgRuntimeArgs(version)
			, fs: {
				readFile: path => sendMessage('readFile', [path])
			}
			, postMessage: (sessionId, message) => clientRef.current.sendDebugAdapterMessage(sessionId, message)
		});

		serverRef.current = new Server({
			readdir(path) {
				return sendMessage('readdir', [path]);
			}

			, async readFile(path) {
				return Array.from(await sendMessage('readFile', [path]));
			}

			, analyzePath(path) {
				return sendMessage('analyzePath', [path]);
			}

			, writeFile(filePath, contents) {
				return sendMessage('writeFile', [filePath, new Uint8Array(contents)]);
			}

			, rename(...args) {
				return sendMessage('rename', args);
			}

			, mkdir(...args) {
				return sendMessage('mkdir', args);
			}

			, unlink(...args) {
				return sendMessage('unlink', args);
			}

			, rmdir(...args) {
				return sendMessage('rmdir', args);
			}

			, async activate(...args) {
				await ensureDebugFiles(version);
				const configurePromise = clientRef.current.configure({
					filesAssociations: GENERATED_FILES_ASSOCIATIONS
				}).catch(error => {
					console.warn('Failed to configure file-bus document associations.', error);
				});

				if(path)
				{
					clientRef.current.openFile(path, {
						languageId: getAssociatedLanguageId(path) || undefined
					});
				}

				await configurePromise;

				return args.length ? args[0] : true;
			}

			, acceptVSCodeMessage(...args) {
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
		}, innerOrigin);

		const onMessage = event => serverRef.current.handleMessageEvent(event);
		window.addEventListener('message', onMessage);

		return () => {
			window.removeEventListener('message', onMessage);
			adapterRef.current?.dispose();
			adapterRef.current = null;
			serverRef.current = null;
			clientRef.current = null;
		};
	}, [innerOrigin, path, version]);

	return (<div className = "editor">
		<div className='bevel'>
			<Header />
			<iframe
				allow="clipboard-read; clipboard-write"
				className='inset'
				ref={iframeRef}
				src={(() => {
					const url = new URL(innerUrl.href);
					url.searchParams.set('origin', outerOrigin);
					return url.href;
				})()}
				title='VS Code Editor'
			></iframe>
		</div>
	</div>);
}
