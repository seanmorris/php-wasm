import './Common.css';
import './InstallDemo.css';

import loader from './tail-spin.svg';

import { PhpWeb } from 'php-wasm/PhpWeb';
import { useEffect, useState } from 'react';
import { sendMessageFor } from 'php-cgi-wasm/msg-bus';

// const sendMessage = sendMessageFor((`${window.location.origin}${process.env.PUBLIC_URL}/cgi-worker.mjs`));
const sendMessage = sendMessageFor(navigator.serviceWorker.controller);

const backupSite = async () => {
	const persistFile = await sendMessage('readdir', ['/persist']);
	const configFiles = await sendMessage('readdir', ['/config']);

	if([persistFile, configFiles].flat().length <= 4)
	{
		throw `Filesystem is empty!`;
	}

	const php = new PhpWeb({persist: [{mountPath:'/persist'}, {mountPath:'/config'}]});
	await php.binary;
	const backupPhpCode = await (await fetch(process.env.PUBLIC_URL + '/scripts/backup.php')).text();
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Backing up files...'}));
	await php.run(backupPhpCode);

	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Refreshing PHP...'}));
	await sendMessage('refresh', []);
	const zipContents = await sendMessage('readFile', ['/persist/backup.zip']);
	const blob = new Blob([zipContents], {type:'application/zip'})
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
	const php = new PhpWeb({persist: [{mountPath:'/persist'}, {mountPath:'/config'}]});
	const zipContents = await fileInput.files[0].arrayBuffer();
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Uploading zip...'}));
	await sendMessage('writeFile', ['/persist/restore.zip', new Uint8Array(zipContents)]);
	await php.binary;
	const restorePhpCode = await (await fetch(process.env.PUBLIC_URL + '/scripts/restore.php')).text();
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Unpacking files...'}));
	await php.run(restorePhpCode);
	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Refreshing PHP...'}));
	await sendMessage('refresh', []);
};

const clearFilesystem = () => {
	const fileDb = indexedDB.open("/persist", 21);
	const configDb = indexedDB.open("/config", 21);

	window.dispatchEvent(new CustomEvent('install-status', {detail: 'Clearing IDBFS...'}));

	const clearDb = openDb => {
		let callback;
		const promise = new Promise(accept => {
			callback = async event => {
				const db = openDb.result;
				const transaction = db.transaction(["FILE_DATA"], "readwrite");
				const objectStore = transaction.objectStore("FILE_DATA");
				objectStore.clear();

				await sendMessage('refresh', []);

				accept();
			}
		});

		return {callback, promise};
	};

	const fileClear = clearDb(fileDb);
	const configClear = clearDb(configDb);

	fileDb.onsuccess = fileClear.callback;
	configDb.onsuccess = configClear.callback;

	return Promise.all([fileClear.promise, configClear.promise]);
};

const makeComponent = (operation) => ({onComplete, onError, onFinally = () => {},  ...args}) => {
	const [message, setMessage] = useState('Initializing...');

	const onStatus = event => setMessage(event.detail);

	useEffect(() => {
		window.addEventListener('install-status', onStatus);
		window.__operation = window.__operation || operation(args)
		.then(() => onComplete())
		.catch(error => onError(error))
		.finally(() => window.__operation = null);
		return () => {
			window.removeEventListener('install-status', onStatus);
		}
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
