import React, { useCallback, useEffect, useRef, useState, forwardRef } from 'react';
import { PhpCliWeb } from 'php-cli-wasm/PhpCliWeb';
import { PGlite } from '@electric-sql/pglite';
import './dbg-preview.css';

import loading from './loading.svg';
import Convert from 'ansi-to-html';
import libxml from 'php-wasm-libxml';

const parser = new Convert();

const defaultSharedLibs = [libxml];

const ini = `
date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
expose_php=0
display_errors = Off
display_startup_errors = Off

log_errors = On
error_log = /dev/stderr
`;

const escapeHtml = s => s
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#039;");

let lastCommand = null;

const phpArgs = {
	version: '8.3',
	ini,
	PGlite,
	persist: [{mountPath:'/persist'}, {mountPath:'/config'}],
	// script: '/preload/hello-world.php'
	// code: 'echo "Hello, PHP-CLI!";',
	// interactive: false,
};

export default function Terminal({
	setStatusMessage = () => {},
	setExitCode = () => {},
	localEcho = true,
	initCommands = [],
	onStdIn,
	sharedLibs = [],
	files = [],
	interactive,
	script,
	code,
	extras,
}) {
	const phpRef = useRef(null);

	const cmdStack = useRef(['']);
	const cmdStackIndex = useRef(0);

	const terminal = useRef('');
	const stdIn  = useRef('');

	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);

	const init = useRef(true);
	const [prompt, setPrompt] = useState(parser.toHtml(escapeHtml('\x1b[1mphp> '))); // @TODO: get the prompt from PHP

	interactive = interactive && !script && !code;

	let timeout = useRef();

	const scrollToEnd = useCallback(() => {
		if(!stdIn.current)
		{
			timeout.current = setTimeout(() => {
				terminal.current.scrollTo({
					top: terminal.current.scrollHeight,
					behavior: 'smooth',
				});

			}, 32);

			return;
		}

		if(timeout.current)
		{
			clearTimeout(timeout.current);
		}

		timeout.current = setTimeout(() => stdIn.current.scrollIntoView(), 32);
	}, []);

	const focusInput = useCallback(event => {
		if(!phpRef.current.interactive)
		{
			scrollToEnd();
			return;
		}
		if(window.getSelection().toString() === '')
		{
			stdIn.current && stdIn.current.focus();
		}
	}, [scrollToEnd]);

	const refreshPhp = useCallback(init => {

		setStatusMessage && setStatusMessage('loading...');

		const onOutput = async event => {
			const newOutput = event.detail.map(text => text
				.replace('\n', '\u240A\n')
				.replace('\r', '\u240D'));

			const ansi = newOutput.map(line => {
				return { type: 'stdout', text: parser.toHtml(escapeHtml(line)) }
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
			});

			console.log(ansi);

			setOutput(output => [...output, ...ansi]);
			scrollToEnd();
		};

		phpRef.current = new PhpCliWeb({
			...extras,
			...phpArgs,
			sharedLibs: [...sharedLibs, ...defaultSharedLibs],
			interactive,
			script,
			code,
		});

		const php = phpRef.current;

		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		setReady(true);

		const firstInput = async () => {
			setStatusMessage && setStatusMessage('php-cli-wasm ready!');
			setReady(true);
			await new Promise(a => setTimeout(a, 10));
			focusInput();
		}

		const onStdInHandler = async event => onStdIn && onStdIn(event);

		const once = {once: true};

		if(interactive)
		{
			php.addEventListener('stdin-request', onStdInHandler);
			php.addEventListener('stdin-request', firstInput, once);
		}
		else
		{
			setStatusMessage && setStatusMessage('php-cli-wasm running...');
		}

		(async () => {
			await php.binary;
			php.run(['-c', '/php.ini']).then((ret) => {
				if(interactive)
				{
					setStatusMessage && setStatusMessage('php-cli-wasm ready!');
				}
				else
				{
					setStatusMessage && setStatusMessage('php-cli-wasm done.');
					setExitCode && setExitCode(ret);
				}
			});
		})();

		return () => {
			php.removeEventListener('output', onOutput);
			php.removeEventListener('error', onError);

			if(interactive)
			{
				php.removeEventListener('stdin-request', onStdInHandler);
				php.removeEventListener('stdin-request', firstInput, once);
			}
		};
	}, [code, extras, focusInput, interactive, onStdIn, script, scrollToEnd, setExitCode, setStatusMessage, sharedLibs]);

	useEffect(() => {
		console.log(init.current);
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

		stdIn.current && stdIn.current.focus();
	};

	const handleTerminalClicked = () => {

		if(!phpRef.current.interactive)
		{
			return;
		}

		focusInput();
	};

	const handleScrollToBottom = () => {
		scrollToEnd();
	};

	return (<div className='phpdbg-console inset' onMouseUp={handleTerminalClicked}>
		<div className='scroll-to-bottom' onClick={handleScrollToBottom}>&#x1F847;</div>
		<div className='console-output' ref = {terminal}>
			{output.map((line, index) => (<div className = 'line' data-type = {line.type} key = {index} dangerouslySetInnerHTML = {{__html: line.text}} ></div>))}
			{interactive && (
				<div className = 'console-input' data-ready = {ready} onClick={focusInput}>
					{!ready && (<img src = {loading} alt = "loading" />)}
					<span dangerouslySetInnerHTML = {{__html:prompt}}></span>
					<input autoFocus = {true} disabled={!ready} autoComplete="off" name = "stdin" onKeyDown={checkEnter} ref = {stdIn} />
					<button onClick = {runCommand}>&gt;</button>
				</div>
			)}
		</div>
	</div>);
};
