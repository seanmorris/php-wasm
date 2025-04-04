import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';
import { PGlite } from '@electric-sql/pglite';

import './dbg-preview.css';
import loading from './loading.svg';

import Convert from 'ansi-to-html';
import Debugger from './Debugger';

// const parser = new Convert;

// const sharedLibs = [
// 	`php${PhpDbgWeb.phpVersion}-zlib.so`,
// 	`php${PhpDbgWeb.phpVersion}-zip.so`,
// 	`php${PhpDbgWeb.phpVersion}-gd.so`,
// 	`php${PhpDbgWeb.phpVersion}-iconv.so`,
// 	`php${PhpDbgWeb.phpVersion}-intl.so`,
// 	`php${PhpDbgWeb.phpVersion}-openssl.so`,
// 	`php${PhpDbgWeb.phpVersion}-dom.so`,
// 	`php${PhpDbgWeb.phpVersion}-mbstring.so`,
// 	`php${PhpDbgWeb.phpVersion}-sqlite.so`,
// 	`php${PhpDbgWeb.phpVersion}-pdo-sqlite.so`,
// 	// `php${PhpDbgWeb.phpVersion}-phar.so`,
// 	`php${PhpDbgWeb.phpVersion}-xml.so`,
// 	`php${PhpDbgWeb.phpVersion}-simplexml.so`,
// 	{url: `libxml2.so`, ini:false},
// ];

// const files = [
// 	{ parent: '/preload/', name: 'icudt72l.dat', url: './icudt72l.dat' },
// 	{ parent: '/preload/', name: 'hello-world.php', url: './scripts/hello-world.php' },
// ];

// const ini = `
// 	date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
// 	expose_php=0
// `;

// const escapeHtml = s => s
// 	.replace(/&/g, "&amp;")
// 	.replace(/</g, "&lt;")
// 	.replace(/>/g, "&gt;")
// 	.replace(/"/g, "&quot;")
// 	.replace(/'/g, "&#039;");

// let init = true;
// let lastCommand = null;
// let localEcho = true;

// const delay = d => new Promise(a => setTimeout(a, d));

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
