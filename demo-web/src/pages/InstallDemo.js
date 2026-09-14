/**
 * Popup installer flow for restoring packaged framework demos into the CGI worker.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Terminal from '../components/Terminal';
import loader from '../assets/ui/bar-spin.svg';
import { getPhpBus, waitForPhpBusRequest } from '../lib/phpBus';
import { basePath } from '../lib/runtimePaths';
import { ensureServiceWorker, serviceWorkerControlTimeoutMs } from '../lib/serviceWorker';
import {
	drupalPgsqlDatabase
	, drupalPgsqlReadyQuery
	, isDrupalPgsqlReady
} from '../lib/drupalDatabase';

// import zlib from 'php-wasm-zlib';
// import libzip from 'php-wasm-libzip';

import '../styles/Common.css';
import '../styles/InstallDemo.css';

const packages = {
	'drupal-11': {
		name:  'Drupal 11.4.5'
		, file:  '/backups/drupal-11.4.5.zip'
		, path:  'drupal-11.4.5'
		, vHost: 'drupal'
		, dir:   'drupal-11.4.5/web'
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
	, 'wordpress-7.1': {
		name:  'WordPress 7.1'
		, file:  '/backups/wordpress-7.1.zip'
		, path:  'wordpress-7.1'
		, vHost: 'wordpress'
		, dir:   'wordpress-7.1'
		, entry: 'index.php'
	}
};

const drupalDatabaseVariants = {
	sqlite: packages['drupal-11']
	, pgsql: {
		...packages['drupal-11']
		, name: 'Drupal 11.4.5 with PostgreSQL'
		, path: 'drupal-11.4.5-pgsql'
		, dir: 'drupal-11.4.5-pgsql/web'
		, installMarker: 'drupal-11.4.5-pgsql/.php-wasm-install-complete'
		, refreshCgi: false
		, sql: '/backups/drupal-11.4.5-pgsql.sql'
		, sqlDatabase: drupalPgsqlDatabase
		, sqlReadyQuery: drupalPgsqlReadyQuery
		, patches: [
			{
				path: 'web/sites/default/settings.php'
				, append: `

// PHP-WASM PostgreSQL demo override.
// A cold Drupal cache build issues enough browser-backed queries to exceed
// PHP's default 30-second request limit.
set_time_limit(180);

$databases['default']['default'] = array (
  'database' => 'postgres',
  'username' => 'postgres',
  'password' => '',
  'prefix' => '',
  'host' => 'drupal-11-pg18',
  'port' => '5432',
  'driver' => 'pgsql',
  'namespace' => 'Drupal\\pgsql\\Driver\\Database\\pgsql',
  'autoload' => 'core/modules/pgsql/src/Driver/Database/pgsql/',
);
`
			}
			, {
				path: 'web/core/themes/olivero/templates/includes/get-started.html.twig'
				, replacements: [
					[
						'%2Fpersist%2Fdrupal-11.4.5%2Fweb'
						, '%2Fpersist%2Fdrupal-11.4.5-pgsql%2Fweb'
					]
				]
			}
		]
	}
};

/**
 * Notifies the opener window that a framework install has completed.
 */
const informOpener = (selectedFrameworkName) => {
	window.opener && window.opener.dispatchEvent(
		new CustomEvent('install-complete', {detail: selectedFrameworkName})
	);
};

const serviceWorkerRetryKey = 'php-wasm-install-demo-service-worker-retry';
const serviceWorkerReloadDelayMs = 500;
const installerRpcTimeouts = {
	runtimeReady: 180000
	, awaitFilesystem: 180000
	, analyzePath: 5000
	, readFile: 30000
	, writeFile: 30000
	, unlink: 30000
	, getSettings: 10000
	, setSettings: 10000
	, storeInit: 10000
	, replaceSql: 180000
	, runSql: 30000
	, refresh: 120000
};
/**
 * Converts install-time RPC failures into readable status strings.
 */
const formatInstallError = error => {
	const detail = error?.error ?? error?.message ?? String(error);

	if(error?.action)
	{
		return `Installer request "${error.action}" failed: ${detail}`;
	}

	return `Installer failed: ${detail}`;
};

/**
 * Strips service-worker settings down to the serializable fields the installer mutates.
 */
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

/**
 * Sends an installer RPC over quickbus with per-action timeout defaults.
 */
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

/**
 * Applies backend-specific text patches after a package has been unpacked.
 */
const applyPackagePatches = async (bus, selectedFramework) => {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();

	for(const patch of selectedFramework.patches ?? [])
	{
		const path = `/persist/${selectedFramework.path}/${patch.path}`;
		const bytes = await sendInstallMessage(bus, 'readFile', [path]);
		let contents = decoder.decode(bytes);

		for(const [search, replacement] of patch.replacements ?? [])
		{
			contents = contents.split(search).join(replacement);
		}

		contents += patch.append ?? '';
		await sendInstallMessage(bus, 'writeFile', [path, encoder.encode(contents)]);
	}
};

/**
 * Points a shared CGI vhost at the selected package only after it is ready.
 */
const activatePackage = async (bus, selectedFramework, vHostPrefix) => {
	const settings = createSerializableSettings(
		await sendInstallMessage(bus, 'getSettings')
	);
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
};

/**
 * Downloads, restores, and activates a selected framework package.
 */
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
						console.error('CGI service worker startup failed.', {
							controlSource: serviceWorker.controlSource
							, error: serviceWorker.error
							, diagnostics: serviceWorker.diagnostics
						});

						if(serviceWorker.controlSource === 'error')
						{
							updateMessage(
								serviceWorker.error?.message
								?? 'Failed to register the CGI service worker for the installer popup.'
							);
							return;
						}

						if(serviceWorker.controlSource === 'unsupported')
						{
							updateMessage('This browser does not support service workers for the installer popup.');
							return;
						}

						if(serviceWorker.controlSource.endsWith('-timeout'))
						{
							updateMessage(
								serviceWorker.error?.message
								?? 'The CGI service worker timed out during startup.'
							);
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
					const selectedDatabase = query.get('database') ?? 'sqlite';
					const overwrite = query.get('overwrite') ?? false;

					if(!selectedFrameworkName)
					{
						updateMessage('No framework selected.');
						return;
					}

					if(!Object.hasOwn(packages, selectedFrameworkName))
					{
						updateMessage('Invalid framework selected.');
						return;
					}

					if(
						selectedFrameworkName === 'drupal-11'
						&& !Object.hasOwn(drupalDatabaseVariants, selectedDatabase)
					) {
						updateMessage('Invalid database selected.');
						return;
					}

					const selectedFramework = selectedFrameworkName === 'drupal-11'
						? drupalDatabaseVariants[selectedDatabase]
						: packages[selectedFrameworkName];

					updateMessage('Starting PHP runtime...');
					await sendInstallMessage(bus, 'runtimeReady');

					updateMessage('Downloading init script...');
					const initPhpCode = await (await fetch(basePath('scripts/init.php'))).text();

					updateMessage('Acquiring Lock...');
					await navigator.locks.request('php-wasm-demo-install', async () => {
							updateMessage('Checking for Existing Install...');
							const checkPath = await sendInstallMessage(bus, 'analyzePath', [
								'/persist/' + (selectedFramework.installMarker ?? selectedFramework.dir)
							]);
							const vHostPrefix = basePath(`cgi-bin/${selectedFramework.vHost}`);
							let installReady = checkPath.exists;

							if(!overwrite && installReady && selectedFramework.sqlReadyQuery)
							{
								const readiness = await sendInstallMessage(bus, 'runSql', [
									selectedFramework.sqlDatabase
									, selectedFramework.sqlReadyQuery
								]);

								installReady = isDrupalPgsqlReady(readiness);
							}

							if(!selectedFramework.sql)
							{
								await activatePackage(bus, selectedFramework, vHostPrefix);
							}

							if(!overwrite && installReady)
							{
								updateMessage('Already installed...');
								if(selectedFramework.sql)
								{
									await activatePackage(bus, selectedFramework, vHostPrefix);
								}
								await sendInstallMessage(bus, 'awaitFilesystem', []);
								if(selectedFramework.refreshCgi !== false)
								{
									await sendInstallMessage(bus, 'refresh', []);
								}
								informOpener(selectedFrameworkName);
								window.location.href = basePath(`cgi-bin/${selectedFramework.vHost}`);
								return;
							}

							updateMessage(`Downloading ${selectedFramework.file}...`);
							const zipContents = await (await fetch(basePath(selectedFramework.file))).arrayBuffer();
							await sendInstallMessage(bus, 'writeFile', ['/persist/restore.zip', new Uint8Array(zipContents)]);
							await sendInstallMessage(bus, 'writeFile', ['/config/restore-path.tmp', '/persist/' + selectedFramework.path]);

							if(selectedFramework.installMarker && checkPath.exists)
							{
								await sendInstallMessage(bus, 'unlink', [
									`/persist/${selectedFramework.installMarker}`
								]);
								await sendInstallMessage(bus, 'awaitFilesystem', []);
							}

							updateMessage(`Setting up ${selectedFrameworkName}...`);

							updateMessage(`Unpacking ${selectedFramework.file}...`);

							await new Promise(resolveInstall => {
								let completionStarted = false;
								const onComplete = async (exitCode) => {
									if(completionStarted)
									{
										return;
									}

									completionStarted = true;
								try
								{
									if(exitCode !== 0)
									{
										updateMessage(
											`Could not unpack ${selectedFramework.file} (PHP CLI exited with code ${exitCode}).`
										);
										return;
									}

									if(selectedFramework.patches)
									{
										updateMessage(`Configuring ${selectedFramework.name}...`);
										await applyPackagePatches(bus, selectedFramework);
									}

									if(selectedFramework.sql)
									{
										updateMessage('Setting up PostgreSQL...');
										const sqlFile = await (await fetch(basePath(selectedFramework.sql))).text();
										await sendInstallMessage(bus, 'replaceSql', [
											selectedFramework.sqlDatabase
											, sqlFile
										]);
										await activatePackage(bus, selectedFramework, vHostPrefix);
									}

									if(selectedFramework.installMarker)
									{
										await sendInstallMessage(bus, 'writeFile', [
											`/persist/${selectedFramework.installMarker}`
											, new TextEncoder().encode('complete\n')
										]);
									}

									updateMessage('Preparing PHP-CGI...');
									await sendInstallMessage(bus, 'awaitFilesystem', []);
									if(selectedFramework.refreshCgi !== false)
									{
										await sendInstallMessage(bus, 'refresh', []);
									}

									updateMessage(`Opening ${selectedFrameworkName}...`);
									informOpener(selectedFrameworkName);
									window.location.href = vHostPrefix;
								}
								catch(error)
								{
									console.error(error);
									updateMessage(formatInstallError(error));
								}
									finally
									{
										resolveInstall();
									}
								};

								updateTerminal(
									<div className = "install-terminal">
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
		<div className = "install-demo viewport-page">
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
