import '../styles/Common.css';
import '../styles/InstallDemo.css';

import loader from '../assets/ui/bar-spin.svg';

import { PhpWeb } from 'php-wasm/PhpWeb';
import { basePath } from '../lib/runtimePaths';
import { getPhpBus } from '../lib/phpBus';

import libxml from 'php-wasm-libxml';
import zlib from 'php-wasm-zlib';
import libzip from 'php-wasm-libzip';

import { useEffect, useEffectEvent, useState } from 'react';
const sharedLibs = [libxml, zlib, libzip];

const backupSite = async () => {
	const bus = await getPhpBus();
	const persistFile = await bus.readdir('/persist');
	const configFiles = await bus.readdir('/config');

	if([persistFile, configFiles].flat().length <= 4)
	{
		throw `Filesystem is empty!`;
	}

	const php = new PhpWeb({
		persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
		, sharedLibs
	});

	await php.binary;
	const backupPhpCode = await (await fetch(basePath('scripts/backup.php'))).text();
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Backing up files...'}));
	await php.run(backupPhpCode);

	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Refreshing PHP...'}));
	await bus.refresh();
	const zipContents = await bus.readFile('/persist/backup.zip');
	const blob = new Blob([zipContents], {type:'application/zip'});
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.click();
	URL.revokeObjectURL(link.href);
};

const restoreSite = async ({fileInput}) => {
	if(!fileInput.files.length)
	{
		throw `No file provided.`;
	}

	const bus = await getPhpBus();
	const php = new PhpWeb({
		persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
		, sharedLibs
	});
	const zipContents = await fileInput.files[0].arrayBuffer();
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Uploading zip...'}));
	await bus.writeFile('/persist/restore.zip', new Uint8Array(zipContents));
	await php.binary;
	const restorePhpCode = await (await fetch(basePath('scripts/restore.php'))).text();
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Unpacking files...'}));
	await php.run(restorePhpCode);
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Refreshing PHP...'}));
	await bus.refresh();
};

const clearFilesystem = () => {
	const fileDb = indexedDB.open("/persist", 21);
	const configDb = indexedDB.open("/config", 21);
	const busPromise = getPhpBus();

	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Clearing IDBFS...'}));

	const clearDb = openDb => {
		let callback;
		const promise = new Promise(accept => {
			callback = async () => {
				const db = openDb.result;
				const transaction = db.transaction(["FILE_DATA"], "readwrite");
				const objectStore = transaction.objectStore("FILE_DATA");
				objectStore.clear();

				const bus = await busPromise;
				await bus.refresh();

				accept();
			};
		});

		return {callback, promise};
	};

	const fileClear = clearDb(fileDb);
	const configClear = clearDb(configDb);

	fileDb.onsuccess = fileClear.callback;
	configDb.onsuccess = configClear.callback;

	return Promise.all([fileClear.promise, configClear.promise]);
};

const makeComponent = (operation) => ({onComplete, onError, ...args}) => {
	const [message, setMessage] = useState('Initializing...');

	const onStatus = useEffectEvent(event => {
		setMessage(event.detail);
	});

	const runOperation = useEffectEvent(() => {
		window.__operation = window.__operation || operation(args)
		.then(() => onComplete())
		.catch(error => onError(error))
		.finally(() => window.__operation = null);
	});

	useEffect(() => {
		const statusListener = event => {
			onStatus(event);
		};

		window.addEventListener('install-status', statusListener);
		runOperation();

		return () => {
			window.removeEventListener('install-status', statusListener);
		};
	}, []);

	return message && ( <div className = "install-demo">
		<div className = "center">
			<div className = "bevel">
				<div className = "inset padded column center">
					<img className = "loader-icon" src = {loader} alt = "loading" />
					{message}
				</div>
			</div>
		</div>
	</div>);
};

export const Restore = makeComponent(restoreSite);
export const Backup = makeComponent(backupSite);
export const Clear = makeComponent(clearFilesystem);
