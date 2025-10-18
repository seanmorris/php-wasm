import './Common.css';
import './Editor.css';
import Header from './Header';
import { sendMessageFor } from 'php-cgi-wasm/msg-bus';

import { useVSCode } from 'vscode-react';
import { useMemo } from 'react';

const sendMessage = sendMessageFor(navigator.serviceWorker.controller);

export default function VSCodeEditor() {

	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const path = query.has('path') ? query.get('path') : false;

	const {VSCode, executeCommand, openFile} = useVSCode({
		url: 'https://oss-code.pages.dev',
		// url: 'http://localhost:8081',
		fsHandlers: {
			readdir(...args) {
				return sendMessage('readdir', args);
			},

			async readFile(...args) {
				return Array.from(await sendMessage('readFile', args));
			},

			analyzePath(...args) {
				return sendMessage('analyzePath', args);
			},

			writeFile(path, contents) {
				return sendMessage('writeFile', [path, new Uint8Array(contents)]);
			},

			rename(...args) {
				return sendMessage('rename', args);
			},

			mkdir: (...args) => {
				return sendMessage('mkdir', args);
			},

			unlink: (...args) => {
				return sendMessage('unlink', args);
			},

			rmdir: (...args) => {
				return sendMessage('rmdir', args);
			},

			activate: (...args) => {
				console.log('activate', ...args);
				path && openFile(path);
			},
		},
	});

	return (<div className = "editor">
		<div className='bevel'>
			<Header />
			<VSCode className='inset'/>
		</div>
	</div>);
}
