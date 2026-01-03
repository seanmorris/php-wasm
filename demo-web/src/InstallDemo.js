import { useEffect, useMemo, useState } from 'react';
import { sendMessageFor } from 'php-cgi-wasm/msg-bus';
import Terminal from './Terminal';
import loader from './tail-spin.svg';

// import zlib from 'php-wasm-zlib';
// import libzip from 'php-wasm-libzip';

import './Common.css';
import './InstallDemo.css';

const packages = {
	'drupal-7': {
		name:  'Drupal 7',
		//*/
		file:  '/backups/drupal-7.95.zip',
		/*/
		file:  '/backups/drupal-7.95-pgsql.zip',
		sql:   '/backups/drupal-7.95.sql',
		//*/
		path:  'drupal-7.95',
		vHost: 'drupal',
		dir:   'drupal-7.95',
		entry: 'index.php',
	},
	'cakephp-5': {
		name:  'CakePHP 5',
		file:  '/backups/cakephp-5.zip',
		path:  'cakephp-5',
		vHost: 'cakephp-5',
		dir:   'cakephp-5/webroot',
		entry: 'index.php',
	},
	'codeigniter-4': {
		name:  'CodeIgniter 4',
		file:  '/backups/codeigniter-4.zip',
		path:  'codeigniter-4',
		vHost: 'codeigniter-4',
		dir:   'codeigniter-4/public',
		entry: 'index.php',
	},
	'laminas-3': {
		name:  'Laminas 3',
		file:  '/backups/laminas-3.zip',
		path:  'laminas-3',
		vHost: 'laminas-3',
		dir:   'laminas-3/public',
		entry: 'index.php',
	},
	'laravel-11': {
		name:  'Laravel 11',
		file:  '/backups/laravel-11.zip',
		path:  'laravel-11',
		vHost: 'laravel-11',
		dir:   'laravel-11/public',
		entry: 'index.php',
	}
};

const informOpener = (selectedFrameworkName) => {
	window.opener && window.opener.dispatchEvent(
		new CustomEvent('install-complete', {detail: selectedFrameworkName})
	);
};

export default function InstallDemo() {
	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const [message, setMessage] = useState('Initializing...');
	const [terminal, setTerminal] = useState('');

	useEffect(() => void (async()=>{
		await navigator.serviceWorker.register(process.env.PUBLIC_URL + `/cgi-worker.js`);
		await navigator.serviceWorker.getRegistration(`${window.location.origin}${process.env.PUBLIC_URL}/`);
		await navigator.serviceWorker.ready;

		await new Promise((resolve) => {
			if (navigator.serviceWorker.controller) return resolve();
			navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
		});

		if(!(navigator.serviceWorker && navigator.serviceWorker.controller))
		{
			setMessage('No Service Worker Detected, Reloading...');
			await new Promise(a => setTimeout(a, 500));
			window.location.reload();
			return;
		}

		const selectedFrameworkName = query.get('framework');
		const overwrite = query.get('overwrite') ?? false;

		if(!selectedFrameworkName)
		{
			setMessage('No framework selected.');
			return;
		}

		if(!(selectedFrameworkName in packages))
		{
			setMessage('Invalid framework selected.');
			return;
		}

		const selectedFramework = packages[selectedFrameworkName];

		setMessage('Downloading init script...');
		const initPhpCode = await (await fetch(process.env.PUBLIC_URL + '/scripts/init.php')).text();

		setMessage('Acquiring Lock...');
		await navigator.locks.request('php-wasm-demo-install', async () => {

			setMessage('Checking for Existing Install...');
			const sendMessage = sendMessageFor(navigator.serviceWorker.controller);
			const checkPath = await sendMessage('analyzePath', ['/persist/' + selectedFramework.dir]);

			if(!overwrite && checkPath.exists)
			{
				setMessage('Already installed...');
				informOpener(selectedFrameworkName);
				window.location = '/php-wasm/cgi-bin/' + selectedFramework.vHost;
				return;
			}

			setMessage(`Downloading ${selectedFramework.file}...`);
			const zipContents = await (await fetch(process.env.PUBLIC_URL + selectedFramework.file)).arrayBuffer();
			await sendMessage('writeFile', ['/persist/restore.zip', new Uint8Array(zipContents)]);
			await sendMessage('writeFile', ['/config/restore-path.tmp', '/persist/' + selectedFramework.path]);

			setMessage(`Setting up ${selectedFrameworkName}...`);
			const settings = await sendMessage('getSettings');
			const vHostPrefix = '/php-wasm/cgi-bin/' + selectedFramework.vHost;
			const existingvHost = settings.vHosts.find(vHost => vHost.pathPrefix === vHostPrefix);

			if(!existingvHost)
			{
				settings.vHosts.push({
					pathPrefix: vHostPrefix,
					directory:  '/persist/' + selectedFramework.dir,
					entrypoint: selectedFramework.entry
				});
			}
			else
			{
				existingvHost.directory = '/persist/' + selectedFramework.dir;
				existingvHost.entrypoint = selectedFramework.entry;
			}

			await sendMessage('setSettings', [settings]);
			await sendMessage('storeInit');

			setMessage(`Unpacking ${selectedFramework.file}...`);

			const onComplete = async (exitCode) => {
				if(exitCode !== 0) return;
				if(selectedFramework.sql)
				{
					setMessage('Setting up PostgreSQL...');
					const sqlFile = await (await fetch(selectedFramework.sql)).text();
					await sendMessage('execSql', [`idb://host= dbname=drupal port=5432`, sqlFile]);
					await sendMessage('runSql', [`idb://host= dbname=drupal port=5432`, 'select * from information_schema.tables']);
				}

				setMessage('Refreshing PHP-CGI...');
				await sendMessage('refresh', []);

				setMessage(`Opening ${selectedFrameworkName}...`);
				informOpener(selectedFrameworkName);
				window.location = vHostPrefix;
			};

			setTerminal(
				<div style={{
					position: 'relative',
					minWidth: 'min(45rem, 90vw)',
					minHeight: '30rem',
					resize: 'both'
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
	})(), [query]);

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
