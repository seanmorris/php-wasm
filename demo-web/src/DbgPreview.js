import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';
import { PGlite } from '@electric-sql/pglite';

import './dbg-preview.css';

const sharedLibs = [
	`php${PhpDbgWeb.phpVersion}-zlib.so`,
	`php${PhpDbgWeb.phpVersion}-zip.so`,
	`php${PhpDbgWeb.phpVersion}-gd.so`,
	`php${PhpDbgWeb.phpVersion}-iconv.so`,
	`php${PhpDbgWeb.phpVersion}-intl.so`,
	`php${PhpDbgWeb.phpVersion}-openssl.so`,
	`php${PhpDbgWeb.phpVersion}-dom.so`,
	`php${PhpDbgWeb.phpVersion}-mbstring.so`,
	`php${PhpDbgWeb.phpVersion}-sqlite.so`,
	`php${PhpDbgWeb.phpVersion}-pdo-sqlite.so`,
	// `php${PhpDbgWeb.phpVersion}-phar.so`,
	`php${PhpDbgWeb.phpVersion}-xml.so`,
	`php${PhpDbgWeb.phpVersion}-simplexml.so`,
	{url: `libxml2.so`, ini:false},
];

const files = [
	{ parent: '/preload/', name: 'icudt72l.dat', url: './icudt72l.dat' },
	{ parent: '/preload/', name: 'hello-world.php', url: './scripts/hello-world.php' },
];

const ini = `
	date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
	expose_php=0
`;

let init = true;

export default function DbgPreview() {
	const [prompt, setPrompt] = useState('prompt');
	const [file, setFile] = useState('');
	const [line, setLine] = useState('');
	const phpRef = useRef(null);
	const terminal = useRef('');
	const stdIn  = useRef('');
	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);
	const [exitCode, setExitCode] = useState('');
	const [statusMessage, setStatusMessage] = useState('php-wasm');

	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const startPath = query.has('path') ? query.get('path') : false;

	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));

	let timeout = null;

	const scrollToEnd = () => {
		if (!stdIn.current) {
			return;
		}

		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => stdIn.current.scrollIntoView(), 10);
	};

	const onOutput = event => {
		console.log(event.detail.join(''));
		setOutput(output => [...output, ...event.detail.map(text => ({
			text: text.replace('\n', '\u240A\n').replace('\r', '\u240D')
			, type: 'stdout'
		}))]);

		scrollToEnd();
	};

	const onError  = event => {
		console.log(event.detail.join(''));
		setOutput(output => [...output, ...event.detail.map(text => ({
			text: text.replace('\n', '\u240A\n').replace('\r', '\u240D')
			, type: 'stderr'
		}))]);

		scrollToEnd();
	};

	const refreshPhp = useCallback((init) => {
		setStatusMessage('loading...');
		phpRef.current = new PhpDbgWeb({sharedLibs, files, ini, PGlite, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]});

		const php = phpRef.current;

		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		php.run().then(() => {
			setReady(true);
			setStatusMessage('php-dbg-wasm ready!');
			console.log(init, startPath);
			if(init && startPath)
			{
				console.log(stdIn.current);
				stdIn.current.value = `exec ${startPath}`;
				console.log(stdIn.current.value);
				runCommand();
			}
		});

		return () => {
			php.removeEventListener('output', onOutput);
			php.removeEventListener('error', onError);
		};
	}, []);

	useEffect(() => {
		if(init)
		{
			refreshPhp(init);
			init = false;
		}
	}, [refreshPhp]);

	const checkEnter = async event => {
		if(event.key === 'Enter')
		{
			await runCommand();
			event.preventDefault();
			return;
		}
	};

	const runCommand = async event => {
		const inputValue = stdIn.current.value;
		stdIn.current.value = '';
		setReady(false);
		// phpRef.current.inputString('-e /preload/hello-world.php');
		setOutput(output => [...output, {text: inputValue, type: 'stdin'}]);

		const php = phpRef.current;
		const exitCode = await php.tick(inputValue);

		if(php.running)
		{
			setPrompt('');
			setFile(php.currentFile);
			setLine(php.currentLine);
		}
		else
		{
			setPrompt('prompt');

			setFile('');
			setLine('');
		}

		setReady(true);
		// console.log(inputValue, exitCode);
		setExitCode(exitCode);
		stdIn.current.focus();
	}

	const focusInput = event => {
		stdIn.current.focus();
	};

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
		<div className = "row start toolbar" data-status>{file}<span className='line'>{line}</span></div>
		<div className = "row start wide toolbar" data-status>{statusMessage}</div>
	</div>);

	return (<div className = "dbg-preview margined">
		<div className='bevel column'>
			{topBar}
			<div className='inset console'>
				<div className='scroll-to-bottom' onClick={focusInput}>&#x1F847;</div>
				<div className='console-frame' ref = {terminal}>
					<div className='console-output'>
						<span className = "warning">⚠️ <i>This is in VERY early alpha!</i> ⚠️</span>
						{output.map((line, index) => (<div className = 'line' data-type = {line.type} key = {index}>{line.text}</div>))}
					</div>
					<div className = 'console-input' data-ready = {ready} onClick={focusInput}>
						<span>{prompt}&gt;</span>
						<input autoFocus = {true} name = "stdin" onKeyDown={checkEnter} ref = {stdIn} />
						<button onClick = {runCommand}>&gt;</button>
					</div>
				</div>
			</div>
			{statusBar}
		</div>
	</div>)
}
