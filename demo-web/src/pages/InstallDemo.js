import { useEffect, useMemo, useRef, useState } from 'react';
import Terminal from '../components/Terminal';
import loader from '../assets/ui/bar-spin.svg';
import { getPhpBus, waitForPhpBusRequest } from '../lib/phpBus';
import { basePath } from '../lib/runtimePaths';
import { ensureServiceWorker, serviceWorkerControlTimeoutMs } from '../lib/serviceWorker';

// import zlib from 'php-wasm-zlib';
// import libzip from 'php-wasm-libzip';

import '../styles/Common.css';
import '../styles/InstallDemo.css';

const packages = {
	'drupal-7': {
		// Switch these paths to the PostgreSQL backup if needed.
		name:  'Drupal 7'
		, file:  '/backups/drupal-7.95.zip'
		, path:  'drupal-7.95'
		, vHost: 'drupal'
		, dir:   'drupal-7.95'
		, entry: 'index.php'
	}
	, 'cakephp-5': {
		name:  'CakePHP 5'
		, file:  '/backups/cakephp-5.zip'
		, path:  'cakephp-5'
		, vHost: 'cakephp-5'
		, dir:   'cakephp-5/webroot'
		, entry: 'index.php'
	}
	, 'codeigniter-4': {
		name:  'CodeIgniter 4'
		, file:  '/backups/codeigniter-4.zip'
		, path:  'codeigniter-4'
		, vHost: 'codeigniter-4'
		, dir:   'codeigniter-4/public'
		, entry: 'index.php'
	}
	, 'laminas-3': {
		name:  'Laminas 3'
		, file:  '/backups/laminas-3.zip'
		, path:  'laminas-3'
		, vHost: 'laminas-3'
		, dir:   'laminas-3/public'
		, entry: 'index.php'
	}
	, 'laravel-11': {
		name:  'Laravel 11'
		, file:  '/backups/laravel-11.zip'
		, path:  'laravel-11'
		, vHost: 'laravel-11'
		, dir:   'laravel-11/public'
		, entry: 'index.php'
	}
};

const informOpener = (selectedFrameworkName) => {
	window.opener && window.opener.dispatchEvent(
		new CustomEvent('install-complete', {detail: selectedFrameworkName})
	);
};

const serviceWorkerRetryKey = 'php-wasm-install-demo-service-worker-retry';
const serviceWorkerReloadDelayMs = 500;
const installerRpcTimeouts = {
	analyzePath: 5000
	, writeFile: 30000
	, getSettings: 10000
	, setSettings: 10000
	, storeInit: 10000
	, refresh: 30000
};
const formatInstallError = error => {
	const detail = error?.error ?? error?.message ?? String(error);

	if(error?.action)
	{
		return `Installer request "${error.action}" failed: ${detail}`;
	}

	return `Installer failed: ${detail}`;
};

const createSerializableSettings = settings => ({
	docroot: settings?.docroot
	, maxRequestAge: settings?.maxRequestAge
	, staticCacheTime: settings?.staticCacheTime
	, dynamicCacheTime: settings?.dynamicCacheTime
	, vHosts: Array.isArray(settings?.vHosts)
		? settings.vHosts.map(vHost => ({
			pathPrefix: vHost?.pathPrefix
			, directory: vHost?.directory
			, entrypoint: vHost?.entrypoint
		}))
		: []
});

const sendInstallMessage = (bus, action, params = []) => {
	const request = bus[action](...params);

	return waitForPhpBusRequest(request, {
		action
		, params
		, timeoutMs: action in installerRpcTimeouts
			? installerRpcTimeouts[action]
			: undefined
	});
};

export default function InstallDemo()
{
	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const [message, setMessage] = useState('Initializing...');
	const [terminal, setTerminal] = useState('');
	const bootstrapPromise = useRef(null);
	const disposed = useRef(false);

	useEffect(() => {
		disposed.current = false;

		const updateMessage = nextMessage => {
			if(!disposed.current)
			{
				setMessage(nextMessage);
			}
		};

		const updateTerminal = nextTerminal => {
			if(!disposed.current)
			{
				setTerminal(nextTerminal);
			}
		};

		const failMissingController = async () => {
			if(!sessionStorage.getItem(serviceWorkerRetryKey))
			{
				sessionStorage.setItem(serviceWorkerRetryKey, '1');
				updateMessage('No Service Worker Detected, Reloading...');
				await new Promise(resolve => setTimeout(resolve, serviceWorkerReloadDelayMs));
				window.location.reload();
				return;
			}

			sessionStorage.removeItem(serviceWorkerRetryKey);
			updateMessage('Service worker did not take control of the installer popup. Close this window and try again.');
		};

		if(!bootstrapPromise.current)
		{
			bootstrapPromise.current = (async () => {
				try
				{
					const serviceWorker = await ensureServiceWorker({
						timeoutMs: serviceWorkerControlTimeoutMs
					});

					if(!serviceWorker.controlled)
					{
						if(serviceWorker.controlSource === 'error')
						{
							updateMessage('Failed to register the CGI service worker for the installer popup.');
							return;
						}

						if(serviceWorker.controlSource === 'unsupported')
						{
							updateMessage('This browser does not support service workers for the installer popup.');
							return;
						}

						await failMissingController();
						return;
					}

					sessionStorage.removeItem(serviceWorkerRetryKey);
					const bus = await getPhpBus({
						timeoutMs: serviceWorkerControlTimeoutMs
					});

					const selectedFrameworkName = query.get('framework');
					const overwrite = query.get('overwrite') ?? false;

					if(!selectedFrameworkName)
					{
						updateMessage('No framework selected.');
						return;
					}

					if(!(selectedFrameworkName in packages))
					{
						updateMessage('Invalid framework selected.');
						return;
					}

					const selectedFramework = packages[selectedFrameworkName];

						updateMessage('Downloading init script...');
						const initPhpCode = await (await fetch(basePath('scripts/init.php'))).text();

						updateMessage('Acquiring Lock...');
						await navigator.locks.request('php-wasm-demo-install', async () => {
							updateMessage('Checking for Existing Install...');
							const checkPath = await sendInstallMessage(bus, 'analyzePath', ['/persist/' + selectedFramework.dir]);

							if(!overwrite && checkPath.exists)
							{
								updateMessage('Already installed...');
								informOpener(selectedFrameworkName);
								window.location = basePath(`cgi-bin/${selectedFramework.vHost}`);
								return;
							}

							updateMessage(`Downloading ${selectedFramework.file}...`);
							const zipContents = await (await fetch(basePath(selectedFramework.file))).arrayBuffer();
							await sendInstallMessage(bus, 'writeFile', ['/persist/restore.zip', new Uint8Array(zipContents)]);
							await sendInstallMessage(bus, 'writeFile', ['/config/restore-path.tmp', '/persist/' + selectedFramework.path]);

							updateMessage(`Setting up ${selectedFrameworkName}...`);
							const settings = createSerializableSettings(
								await sendInstallMessage(bus, 'getSettings')
							);
							const vHostPrefix = basePath(`cgi-bin/${selectedFramework.vHost}`);
							const existingvHost = settings.vHosts.find(vHost => vHost.pathPrefix === vHostPrefix);

							if(!existingvHost)
							{
								settings.vHosts.push({
									pathPrefix: vHostPrefix
									, directory:  '/persist/' + selectedFramework.dir
									, entrypoint: selectedFramework.entry
								});
							}
							else
							{
								existingvHost.directory = '/persist/' + selectedFramework.dir;
								existingvHost.entrypoint = selectedFramework.entry;
							}

							await sendInstallMessage(bus, 'setSettings', [settings]);
							await sendInstallMessage(bus, 'storeInit');

							updateMessage(`Unpacking ${selectedFramework.file}...`);

							const onComplete = async (exitCode) => {
								if(exitCode !== 0) return;
								if(selectedFramework.sql)
								{
									updateMessage('Setting up PostgreSQL...');
									const sqlFile = await (await fetch(selectedFramework.sql)).text();
									await waitForPhpBusRequest(
										bus.execSql(`idb://host= dbname=drupal port=5432`, sqlFile)
										, {
											action: 'execSql'
											, params: [`idb://host= dbname=drupal port=5432`, sqlFile]
										}
									);
									await waitForPhpBusRequest(
										bus.runSql(`idb://host= dbname=drupal port=5432`, 'select * from information_schema.tables')
										, {
											action: 'runSql'
											, params: [`idb://host= dbname=drupal port=5432`, 'select * from information_schema.tables']
										}
									);
								}

								updateMessage('Refreshing PHP-CGI...');
								await sendInstallMessage(bus, 'refresh', []);

								updateMessage(`Opening ${selectedFrameworkName}...`);
								informOpener(selectedFrameworkName);
								window.location = vHostPrefix;
							};

							updateTerminal(
								<div style={{
									position: 'relative'
									, minWidth: 'min(45rem, 90vw)'
									, minHeight: '30rem'
									, resize: 'both'
								}}>
									<Terminal
										className = "inset"
										// sharedLibs = {[zlib, libzip]}
										setExitCode = {onComplete}
										interactive = {false}
										code = {'?>' + initPhpCode}
									/>
								</div>
							);
						});
				}
				catch(error)
				{
					console.error(error);
					updateMessage(formatInstallError(error));
				}
			})();
		}

		return () => {
			disposed.current = true;
		};
	}, [query]);

	return (
		<div className = "install-demo">
			<div className = "center bevel">
				<div className = "inset padded">
					<h2>{message}</h2>
					{terminal}
					<img
						className = "loader-icon"
						src = {loader}
						alt = "loading spinner"
					/>
				</div>
			</div>
		</div>
	);
}
