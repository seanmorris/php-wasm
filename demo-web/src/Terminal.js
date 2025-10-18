import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { PhpCliWeb } from 'php-cli-wasm/PhpCliWeb';
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
import yaml from 'php-wasm-yaml';

const parser = new Convert;

const sharedLibs = [
	libxml,
	// dom,
	// zlib,
	// libzip,
	// gd,
	// iconv,
	// intl,
	// openssl,
	// mbstring,
	// sqlite,
	// xml,
	// simplexml,
	yaml,
];

const ini = `
date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
expose_php=0
display_errors = Off
display_startup_errors = Off

log_errors = On
error_log = /dev/stderr
`;

const files = [
	{ parent: '/preload/', name: 'hello-world.php', url: './scripts/hello-world.php' },
	{ parent: '/preload/', name: 'phpinfo.php',     url: './scripts/phpinfo.php' },
];

const escapeHtml = s => s
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#039;");

let lastCommand = null;

const phpArgs = {
	version: '8.3',
	sharedLibs,
	files,
	ini,
	PGlite,
	persist: [{mountPath:'/persist'}, {mountPath:'/config'}],
	// script: '/preload/hello-world.php'
	// code: 'echo "Hello, PHP-CLI!";',
	// interactive: false,
};

export default forwardRef(function Terminal({
	setStatusMessage, setExitCode, localEcho = true, initCommands = [], onStdIn
}, ref) {
	const phpRef = useRef(null);

	const cmdStack = useRef(['']);
	const cmdStackIndex = useRef(0);

	const terminal = useRef('');
	const stdIn  = useRef('');

	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);

	const init = useRef(true);
	const [prompt, setPrompt] = useState(parser.toHtml(escapeHtml('\x1b[1mphp> ')));

	const query = useMemo(() => new URLSearchParams(window.location.search), []);
	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));

	const [interactive, setInteractive] = useState(!query.has('path') && !query.has('code'));
	const [script, setScript] = useState(query.get('path'));
	const [code, setCode] = useState(query.get('code'));

	let timeout = null;

	const scrollToEnd = () => {
		if(!stdIn.current)
		{
			timeout = setTimeout(() => {
				terminal.current.scrollTo({
					top: terminal.current.scrollHeight,
					behavior: 'smooth',
				});

			}, 32);

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

		phpRef.current = new PhpCliWeb({...phpArgs, interactive, script, code});

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
			php.run(['-dextension=php8.3-yaml.so']).then((ret) => {
				if(interactive)
				{
					setStatusMessage && setStatusMessage('php-cli-wasm ready!');
				}
				else
				{
					setStatusMessage && setStatusMessage('php-cli-wasm done.');
					setExitCode && setExitCode('exit code: ' + ret);
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

		stdIn.current && stdIn.current.focus();
	};

	const focusInput = event => {
		if(!phpRef.current.interactive)
		{
			scrollToEnd();
			return;
		}
		if(window.getSelection().toString() === '')
		{
			stdIn.current && stdIn.current.focus();
		}
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
					{!ready && (<img src = {loading} />)}
					<span dangerouslySetInnerHTML = {{__html:prompt}}></span>
					<input autoFocus = {true} disabled={!ready} autoComplete="off" name = "stdin" onKeyDown={checkEnter} ref = {stdIn} />
					<button onClick = {runCommand}>&gt;</button>
				</div>
			)}
		</div>
	</div>);
});
