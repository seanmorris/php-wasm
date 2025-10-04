import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';
import { PGlite } from '@electric-sql/pglite';

import './dbg-preview.css';
import loading from './loading.svg';

import Convert from 'ansi-to-html';

import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';
import zlib from 'php-wasm-zlib';
import libzip from 'php-wasm-libzip';
import gd from 'php-wasm-gd';
import iconv from 'php-wasm-iconv';
import intl from 'php-wasm-intl';
import openssl from 'php-wasm-openssl';
import mbstring from 'php-wasm-mbstring';
import sqlite from 'php-wasm-sqlite';
import xml from 'php-wasm-xml';
import simplexml from 'php-wasm-simplexml';

const parser = new Convert;

const sharedLibs = [
	libxml,
	dom,
	zlib,
	libzip,
	gd,
	iconv,
	intl,
	openssl,
	mbstring,
	sqlite,
	xml,
	simplexml,
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

let lastCommand = null;

export default forwardRef(function Debugger({
	file, setCurrentFile, setCurrentLine, setStatusMessage
	, localEcho = true, initCommands = [], onStdIn
}, ref) {
	const phpRef = useRef(null);
	const cmdStack = useRef(['']);
	const cmdStackIndex = useRef(0);
	const terminal = useRef('');
	const stdIn  = useRef('');
	const [prompt, setPrompt] = useState(parser.toHtml(escapeHtml('\x1b[1mprompt> ')));
	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);
	const [exitCode, setExitCode] = useState('');
	const init = useRef(true);

	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));
	const startPath = file;

	useImperativeHandle(ref, () => ({
		setBreakpoint (file, line) { runCommand(null, `b ${file}:${line}`, true); },
		clearBreakpoint (id) { runCommand(null, `b ~ ${id}`, true); },
		bpCount() { return phpRef.current.bpCount(); },
		run() { runCommand(null, `run`, true); },
		step() { runCommand(null, `step`, true); },
		continue() { runCommand(null, `continue`, true); },
		until() { runCommand(null, `until`, true); },
		next() { runCommand(null, `next`, true); },
		finish() { runCommand(null, `finish`, true); },
		leave() { runCommand(null, `leave`, true); },
	}));

	let timeout = null;

	const scrollToEnd = () => {
		if(!stdIn.current)
		{
			return;
		}

		if(timeout)
		{
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
		phpRef.current = new PhpDbgWeb({version: '8.3', sharedLibs, files, ini, PGlite, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]});

		const php = phpRef.current;

		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		const firstInput = async () => {

			if(init && startPath)
			{
				setReady(false);
				await runCommand(null, `exec ${startPath}`);
			}

			await Promise.all( initCommands.map(async cmd => runCommand(null, cmd, true)) );

			await runCommand(null, 'set pagination off', true);

			setStatusMessage && setStatusMessage('php-dbg-wasm ready!');
			setReady(true);
			await new Promise(a => setTimeout(a, 10));
			focusInput();
		}

		const onStdInHandler = async event => {
			setCurrentFile && setCurrentFile( await php.currentFile() );
			setCurrentLine && setCurrentLine( await php.currentLine() );
			setPrompt( parser.toHtml(escapeHtml(await php.getPrompt())) );
			onStdIn && onStdIn(event);
		};

		const once = {once: true};

		php.addEventListener('stdin-request', onStdInHandler);
		php.addEventListener('stdin-request', firstInput, once);

		php.run();

		return () => {
			php.removeEventListener('output', onOutput);
			php.removeEventListener('error', onError);
			php.removeEventListener('stdin-request', onStdInHandler);
			php.removeEventListener('stdin-request', firstInput, once);
		};
	}, []);

	useEffect(() => {
		if(init.current)
		{
			refreshPhp(init.current);
			init.current = false;
		}
	}, [refreshPhp, init]);

	const checkEnter = async event => {
		if(event.key === 'ArrowUp')
		{
			event.preventDefault();

			if(event.target.selectionStart > 0)
			{
				event.target.selectionStart = 0;
				event.target.selectionEnd = 0;
				return;
			}

			cmdStackIndex.current--;
			if(cmdStackIndex.current < 0)
			{
				cmdStackIndex.current = cmdStack.current.length - 1;
			}

			stdIn.current.value = cmdStack.current[cmdStackIndex.current];

			event.target.selectionStart = 0;
			event.target.selectionEnd = 0;

			return;
		}

		if(event.key === 'ArrowDown')
		{
			event.preventDefault();

			const end = event.target.value.length;

			if(event.target.selectionStart < end)
			{
				event.target.selectionStart = end;
				event.target.selectionEnd = end;
				return;
			}

			stdIn.current.value = cmdStack.current[cmdStackIndex.current];

			cmdStackIndex.current++;
			if(cmdStackIndex.current >= cmdStack.current.length)
			{
				cmdStackIndex.current = 0;
			}

			return;
		}

		if(event.key === 'Enter')
		{
			cmdStackIndex.current = 0;
			await runCommand();
			event.preventDefault();
			return;
		}
	};

	const runCommand = async (event, command = null, silent = false) => {

		const inputValue = command || stdIn.current.value || '';

		if(!phpRef.current)
		{
			return;
		}

		if(command === null)
		{
			stdIn.current.value = '';
		}

		if(localEcho && !silent)
		{
			inputValue && cmdStack.current.push(inputValue);
			setOutput(output => [...output, {text: `<span>${prompt}</span><span>${inputValue}</span>`, type: 'stdin'}]);
			scrollToEnd();
		}

		const php = phpRef.current;

		await php.provideInput(inputValue);

		lastCommand = inputValue || lastCommand;
		setExitCode(exitCode);

		stdIn.current && stdIn.current.focus();
	}

	const focusInput = event => {
		if(window.getSelection().toString() === '')
		{
			stdIn.current && stdIn.current.focus();
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
			<input autoFocus = {true} disabled={!ready} autoComplete="off" name = "stdin" onKeyDown={checkEnter} ref = {stdIn} />
			<button onClick = {runCommand}>&gt;</button>
		</div>
	</div>);
});
