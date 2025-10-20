import React, { useMemo, useState } from 'react';
import './dbg-preview.css';
import Debugger from './Debugger';

export default function DbgPreview() {

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [file, setCurrentFile] = useState('');
	const [line, setCurrentLine] = useState('');
	const [statusMessage, setStatusMessage] = useState('php-wasm');
	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));

	const startPath = query.has('path') ? query.get('path') : false;
	const topBar = (<div className = "row header toolbar">
		<div className = "cols">
			<div className = "row start">
				{isIframe || <span className = "contents">
					<a href = { process.env.PUBLIC_URL || "/" }>
						<img src = "sean-icon.png" alt = "sean" />
					</a>
					<h1><a href = { process.env.PUBLIC_URL || "/" }>php-wasm</a></h1>
					<hr />
				</span>}
			</div>
			<div className = "separator"></div>
			<div>
				<h1>php-dbg-wasm preview</h1>
			</div>
		</div>
	</div>);

	const statusBar = (<div className = "row status">
		<div className = "row start toolbar" data-status>
			<span className='file'>{file}</span>
			<span className='line'>{line}</span>
		</div>
		<div className = "row start wide toolbar" data-status>{statusMessage}</div>
	</div>);

	return (<div className = "dbg-preview margined">
		<div className='bevel column'>
			{topBar}
			<div className='inset frame'>
				<Debugger
					file = {startPath}
					setCurrentFile = {setCurrentFile}
					setCurrentLine = {setCurrentLine}
					setStatusMessage = {setStatusMessage}
					localEcho = {true}
				/>
			</div>
			{statusBar}
		</div>
	</div>)
}
