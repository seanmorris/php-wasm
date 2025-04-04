import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';
import { PGlite } from '@electric-sql/pglite';

import './dbg-preview.css';
import loading from './loading.svg';

import Convert from 'ansi-to-html';

const parser = new Convert;

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

const escapeHtml = s => s
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#039;");

let init = true;
let lastCommand = null;

export default forwardRef(function Debugger({
	file, setCurrentFile, setCurrentLine, setStatusMessage
	, localEcho = true, initCommands = [], onStdIn
}, ref) {
	const phpRef = useRef(null);
	const terminal = useRef('');
	const stdIn  = useRef('');
	const [prompt, setPrompt] = useState(parser.toHtml(escapeHtml('\x1b[1mprompt> ')));
	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);
	const [exitCode, setExitCode] = useState('');

	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));
	const startPath = file;

	useImperativeHandle(ref, () => ({
		setBreakpoint (file, line) { runCommand(null, `b ${file}:${line}`); },
		clearBreakpoint (id) { runCommand(null, `b ~ ${id}`); },
		bpCount() { return phpRef.current.bpCount(); },
		run() { runCommand(null, `run`); },
		step() { runCommand(null, `step`); },
		continue() { runCommand(null, `continue`); },
		until() { runCommand(null, `until`); },
		next() { runCommand(null, `next`); },
		finish() { runCommand(null, `finish`); },
		leave() { runCommand(null, `leave`); },
	}));

	let timeout = null;

	const scrollToEnd = () => {
		if (!stdIn.current) {
			return;
		}

		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => stdIn.current.scrollIntoView(), 32);
	};

	const onOutput = async event => {
		const newOutput = event.detail.map(text => text
			.replace('\n', '\u240A\n')
			.replace('\r', '\u240D'));

		const ansi = newOutput.map(line => {
			return { type: 'stdout', text: parser.toHtml(escapeHtml(line)) }
			// return { type: 'stdout', text: escapeHtml(line) }
		});

		setOutput(output => [...output, ...ansi]);
		scrollToEnd();
	};

	const onError  = async event => {
		const newOutput = event.detail.map(text => text
			.replace('\n', '\u240A\n')
			.replace('\r', '\u240D'));

		const ansi = newOutput.map(line => {
			return { type: 'stderr', text: parser.toHtml(escapeHtml(line)) }
			// return { type: 'stderr', text: escapeHtml(line) }
		});

		setOutput(output => [...output, ...ansi]);
		scrollToEnd();
	};

	const refreshPhp = useCallback(init => {
		setStatusMessage && setStatusMessage('loading...');
		phpRef.current = new PhpDbgWeb({sharedLibs, files, ini, PGlite, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]});

		const php = phpRef.current;

		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		const firstInput = async () => {

			if(init && startPath)
			{
				setReady(false);
				await runCommand(null, `exec ${startPath}`);
			}

			await Promise.all( initCommands.map(async cmd => runCommand(null, cmd, false)) );

			await runCommand(null, 'set pagination off', true);

			setStatusMessage && setStatusMessage('php-dbg-wasm ready!');
			setReady(true);
			await new Promise(a => setTimeout(a, 10));
			focusInput();
		}

		php.addEventListener('stdin-request', firstInput, {once: true});
		php.addEventListener('stdin-request', async event => {
			setCurrentFile && setCurrentFile( await php.currentFile() );
			setCurrentLine && setCurrentLine( await php.currentLine() );
			setPrompt( parser.toHtml(escapeHtml(await php.getPrompt())) );

			onStdIn && onStdIn(event);
		});

		php.run();

		php.binary.then(() => {

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

	const runCommand = async (event, command = null, silent = false) => {

		const inputValue = command || stdIn.current.value || '';

		if (command === null) {
			stdIn.current.value = '';
		}

		if (localEcho && !silent) {
			setOutput(output => [...output, {text: `<span>${prompt}</span><span>${inputValue}</span>`, type: 'stdin'}]);
			scrollToEnd();
		}

		const php = phpRef.current;

		await php.provideInput(inputValue);

		lastCommand = inputValue || lastCommand;
		setExitCode(exitCode);
		stdIn.current.focus();
	}

	const focusInput = event => {
		if (window.getSelection().toString() === '') {
			stdIn.current.focus();
		}
	};

	return (<div className='phpdbg-console' ref = {terminal} onMouseUp={focusInput}>
		<div className='scroll-to-bottom' onClick={focusInput}>&#x1F847;</div>
		<div className='console-output'>
			<span className = "warning">⚠️ <i>This is in VERY early alpha!</i> ⚠️</span>
			{output.map((line, index) => (<div className = 'line' data-type = {line.type} key = {index} dangerouslySetInnerHTML = {{__html: line.text}} ></div>))}
		</div>
		<div className = 'console-input' data-ready = {ready} onClick={focusInput}>
			{!ready && (<img src = {loading} />)}
			<span dangerouslySetInnerHTML = {{__html:prompt}}></span>
			<input autoFocus = {true} disabled={!ready} name = "stdin" onKeyDown={checkEnter} ref = {stdIn} />
			<button onClick = {runCommand}>&gt;</button>
		</div>
	</div>);
});
