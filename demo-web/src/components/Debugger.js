/**
 * Browser debugger console backed by php-dbg-wasm.
 */
import { forwardRef, useCallback, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';
import { PGlite } from '@electric-sql/pglite';

import '../styles/dbg-preview.css';
import loading from '../assets/ui/loading.svg';

import Convert from 'ansi-to-html';
import { buildType } from '../lib/runtimePaths';

const parser = new Convert;

const sharedLibs = [
];

if(buildType === 'dynamic')
{
	sharedLibs.push(...(await Promise.all([
		import('php-wasm-libxml')
		, import('php-wasm-dom')
		, import('php-wasm-zlib')
		, import('php-wasm-libzip')
		, import('php-wasm-gd')
		, import('php-wasm-iconv')
		, import('php-wasm-intl')
		, import('php-wasm-openssl')
		, import('php-wasm-mbstring')
		, import('php-wasm-sqlite')
		, import('php-wasm-xml')
		, import('php-wasm-simplexml')
		, import('php-wasm-yaml')
	])).map(module => module.default));
}
else if(buildType === 'shared')
{
	sharedLibs.push(
		// {name: 'libxml2.so', url: (new URL('php-wasm-libxml/libxml2.so', import.meta.url))}
		{name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so', import.meta.url)}
		, {name: 'libzip.so',      url: new URL('php-wasm-libzip/libzip.so', import.meta.url)}
		, {name: 'libfreetype.so', url: new URL('php-wasm-gd/libfreetype.so', import.meta.url)}
		, {name: 'libjpeg.so',     url: new URL('php-wasm-gd/libjpeg.so', import.meta.url)}
		, {name: 'libwebp.so',     url: new URL('php-wasm-gd/libwebp.so', import.meta.url)}
		, {name: 'libpng.so',      url: new URL('php-wasm-gd/libpng.so', import.meta.url)}
		, {name: 'libiconv.so',    url: new URL('php-wasm-iconv/libiconv.so', import.meta.url)}
		, {name: 'libicuuc.so',    url: new URL('php-wasm-intl/libicuuc.so',   import.meta.url)}
		, {name: 'libicutu.so',    url: new URL('php-wasm-intl/libicutu.so',   import.meta.url)}
		, {name: 'libicutest.so',  url: new URL('php-wasm-intl/libicutest.so', import.meta.url)}
		, {name: 'libicuio.so',    url: new URL('php-wasm-intl/libicuio.so',   import.meta.url)}
		, {name: 'libicui18n.so',  url: new URL('php-wasm-intl/libicui18n.so', import.meta.url)}
		, {name: 'libcrypto.so',   url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
		, {name: 'libssl.so',      url: new URL('php-wasm-openssl/libssl.so', import.meta.url)}
		, {name: 'libonig.so',     url: new URL('php-wasm-mbstring/libonig.so', import.meta.url)}
		, {name: 'libsqlite3.so',  url: new URL('php-wasm-sqlite/libsqlite3.so', import.meta.url)}
		, {name: 'libtidy.so',     url: new URL('php-wasm-tidy/libtidy.so', import.meta.url)}
		, {name: 'libyaml.so',     url: new URL('php-wasm-yaml/libyaml.so', import.meta.url)}
	);
}
else
{
	sharedLibs.push(
		{name: 'libcrypto.so', url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
		, {name: 'libssl.so',    url: new URL('php-wasm-openssl/libssl.so', import.meta.url)}
	);

	// files.push({ parent: '/preload/', name: 'icudt72l.dat', url: new URL(`php-wasm-intl/icudt72l.dat`, import.meta.url) });
}

const files = [
	{ parent: '/preload/test_www/', name: 'hello-world.php', url: './scripts/hello-world.php' }
	, { parent: '/preload/test_www/', name: 'phpinfo.php', url: './scripts/phpinfo.php' }
	, { parent: '/preload/', name: 'list-extensions.php', url: './scripts/list-extensions.php' }
];

const ini = `
	date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
	expose_php=0
`;

/**
 * Escapes phpdbg output before ANSI markup is converted into HTML.
 */
const escapeHtml = string => string
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#039;");

const defaultInitCommands = [];

/**
 * Renders the debugger UI and exposes a small imperative bridge via React refs.
 */
export default forwardRef(function Debugger({
	className = ''
	, file
	, initCommands = defaultInitCommands
	, localEcho = true
	, onStdIn
	, setCurrentFile
	, setCurrentLine
	, setStatusMessage
	, setIsExecuting
	, openFile
	, version = '8.3'
}, ref) {
	const phpRef = useRef(null);
	const cmdStack = useRef(['']);
	const cmdStackIndex = useRef(0);
	const terminal = useRef('');
	const stdIn  = useRef('');
	const timeout = useRef(null);

	const [prompt, setPrompt] = useState(parser.toHtml(escapeHtml('\x1b[1mprompt> ')));
	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);

	const [variables, setVariables] = useState({});
	const [globals, setGlobals] = useState({});
	const [constants, setConstants] = useState({});
	const [functions, setFunctions] = useState({});
	const [userClasses, setUserClasses] = useState({});

	const [includedFiles, setIncludedFiles] = useState([]);
	const [trace, setTrace] = useState([]);
	const [currentFrame, setCurrentFrame] = useState(0);

	const [currentPanel, setCurrentPanel] = useState('none');

	const startPath = file;

	const scrollToEnd = useCallback(() => {
		if(timeout.current)
		{
			clearTimeout(timeout.current);
		}

		timeout.current = setTimeout(() => {
			if(stdIn.current)
			{
				stdIn.current.scrollIntoView({
					behavior: 'smooth'
				});
				return;
			}

			terminal.current?.scrollTo({
				behavior: 'smooth'
				, top: terminal.current.scrollHeight
			});
		}, 32);
	}, []);

	const onOutput = useCallback(async event => {
		const newOutput = event.detail.map(text => text
			.replace('\n', '\u240A\n')
			.replace('\r', '\u240D'));

		const ansi = newOutput.map(line => {
			return { type: 'stdout', text: parser.toHtml(escapeHtml(line)) };
		});

		setOutput(output => [...output, ...ansi]);
		scrollToEnd();
	}, [scrollToEnd]);

	const onError = useCallback(async event => {
		const newOutput = event.detail.map(text => text
			.replace('\n', '\u240A\n')
			.replace('\r', '\u240D'));

		const ansi = newOutput.map(line => {
			return { type: 'stderr', text: parser.toHtml(escapeHtml(line)) };
		});

		setOutput(output => [...output, ...ansi]);
		scrollToEnd();
	}, [scrollToEnd]);

	const focusInput = useCallback(() => {
		if(window.getSelection().toString() !== '')
		{
			return;
		}

		if(!phpRef.current?.interactive)
		{
			scrollToEnd();
			return;
		}

		stdIn.current?.focus();
	}, [scrollToEnd]);

	const updateExecutionPanel = useCallback(async panel => {
		const php = phpRef.current;

		if(!php)
		{
			return;
		}

		switch(panel)
		{
			case undefined:
			case 'variables':
				setVariables(await php.dumpVars() || {});
				setCurrentPanel('variables');
				break;

			case 'globals':
				setGlobals(await php.dumpGlobals() || {});
				setCurrentPanel('globals');
				break;

			case 'constants':
				setConstants(await php.dumpConstants() || {});
				setCurrentPanel('constants');
				break;

			case 'classes':
				setUserClasses(await php.dumpClasses() || {});
				setCurrentPanel('classes');
				break;

			case 'functions':
				setFunctions(await php.dumpFunctions() || {});
				setCurrentPanel('functions');
				break;

			case 'files':
				setIncludedFiles(await php.dumpFiles() || []);
				setCurrentPanel('files');
				break;

			case 'trace':
			{
				const oldFrame = await php.switchFrame(0);
				setCurrentFrame(oldFrame);
				setTrace(await php.dumpBacktrace() || []);
				setCurrentPanel('trace');
				php.switchFrame(oldFrame);
				break;
			}
		}
	}, []);

	const runCommand = useCallback(async (event, command = null, silent = false) => {
		const inputValue = command || stdIn.current?.value || '';
		const php = phpRef.current;

		if(!php)
		{
			return;
		}

		if(command === null && stdIn.current)
		{
			stdIn.current.value = '';
		}

		if(localEcho && !silent)
		{
			inputValue && cmdStack.current.push(inputValue);
			setOutput(output => [...output, {
				text: `<span>${prompt}</span><span>${inputValue}</span>`
				, type: 'stdin'
			}]);
			scrollToEnd();
		}

		await php.provideInput(inputValue);

		const isRunning = await php.isExecuting();

		setIsExecuting && setIsExecuting(isRunning);

		if(!silent)
		{
			stdIn.current?.focus();
		}

		if(isRunning)
		{
			if(currentPanel === 'none')
			{
				await updateExecutionPanel('variables');
				return;
			}

			await updateExecutionPanel(currentPanel);
			return;
		}

		setVariables({});
		setGlobals({});
		setConstants({});
		setFunctions({});
		setIncludedFiles([]);
		setCurrentPanel('none');
	}, [currentPanel, localEcho, prompt, scrollToEnd, setIsExecuting, updateExecutionPanel]);

	useImperativeHandle(ref, () => ({
		async setBreakpoint(file, line) {
			await runCommand(null, `b ${file}:${line}`, true);
			return phpRef.current?.bpCount?.() ?? 0;
		}
		, async clearBreakpoint(id) {
			await runCommand(null, `b ~ ${id}`, true);
		}
		, bpCount() { return phpRef.current?.bpCount?.() ?? 0; }
		, run() { void runCommand(null, `run`, true); }
		, step() { void runCommand(null, `step`, true); }
		, continue() { void runCommand(null, `continue`, true); }
		, until() { void runCommand(null, `until`, true); }
		, next() { void runCommand(null, `next`, true); }
		, finish() { void runCommand(null, `finish`, true); }
		, leave() { void runCommand(null, `leave`, true); }
	}), [runCommand]);

	const handleStdInRequest = useEffectEvent(async event => {
		const php = phpRef.current;

		if(!php)
		{
			return;
		}

		setCurrentFile && setCurrentFile(await php.currentFile());
		setCurrentLine && setCurrentLine(await php.currentLine());
		setPrompt(parser.toHtml(escapeHtml(await php.getPrompt())));
		onStdIn && onStdIn(event);
	});

	useEffect(() => {
		setStatusMessage && setStatusMessage('loading...');

		const php = new PhpDbgWeb({
			version
			, sharedLibs
			, files
			, ini
			, PGlite
			, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
		});

		phpRef.current = php;

		const outputListener = event => {
			void onOutput(event);
		};

		const errorListener = event => {
			void onError(event);
		};

		const stdinListener = event => {
			void handleStdInRequest(event);
		};

		const firstInput = async () => {
			const runStartupCommand = async command => {
				await php.provideInput(command);
				const isRunning = await php.isExecuting();
				setIsExecuting && setIsExecuting(isRunning);
			};

			if(startPath)
			{
				setReady(false);
				await runStartupCommand(`exec ${startPath}`);
			}

			for(const command of initCommands)
			{
				await runStartupCommand(command);
			}

			await runStartupCommand('set pagination off');

			setStatusMessage && setStatusMessage('php-dbg-wasm ready!');
			setReady(true);
			await new Promise(resolve => setTimeout(resolve, 10));
			focusInput();
		};

		const once = {once: true};

		php.addEventListener('output', outputListener);
		php.addEventListener('error', errorListener);
		php.addEventListener('stdin-request', stdinListener);
		php.addEventListener('stdin-request', firstInput, once);
		php.run();

		return () => {
			if(timeout.current)
			{
				clearTimeout(timeout.current);
				timeout.current = null;
			}

			php.removeEventListener('output', outputListener);
			php.removeEventListener('error', errorListener);
			php.removeEventListener('stdin-request', stdinListener);
			php.removeEventListener('stdin-request', firstInput, once);

			if(phpRef.current === php)
			{
				phpRef.current = null;
			}
		};
	}, [focusInput, initCommands, onError, onOutput, setIsExecuting, setStatusMessage, startPath, version]);

	const checkEnter = async event => {
		if(event.key === 'ArrowUp')
		{
			event.preventDefault();

			const end = event.target.value.length;

			if(event.target.selectionStart > 0 && event.target.selectionStart !== end)
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
			stdIn.current.selectionStart = stdIn.current.selectionEnd = stdIn.current.value.length;
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

			cmdStackIndex.current++;
			if(cmdStackIndex.current >= cmdStack.current.length)
			{
				cmdStackIndex.current = 0;
			}

			stdIn.current.value = cmdStack.current[cmdStackIndex.current];
			stdIn.current.selectionStart = stdIn.current.selectionEnd = stdIn.current.value.length;
		}

		if(event.key === 'Enter')
		{
			cmdStackIndex.current = 0;
			await runCommand();
			event.preventDefault();
		}
	};

	const handleTerminalClicked = () => {
		if(!phpRef.current?.interactive)
		{
			return;
		}

		focusInput();
	};

	const handleScrollToBottom = () => {
		scrollToEnd();
	};

	const getZvalIdentity = object => {
		if(!object || typeof object !== 'object')
		{
			return object;
		}

		for(const symbol of Object.getOwnPropertySymbols(object))
		{
			if(symbol.description !== 'origZval')
			{
				continue;
			}

			return `zval:${String(object[symbol])}`;
		}

		return object;
	};

	const zvalViews = (object, ancestors = new Set) => {
		const identity = getZvalIdentity(object);

		if(object && ancestors.has(identity))
		{
			return <div className = "phpdbg-zval phpdbg-zval-circular">[Circular]</div>;
		}

		object && ancestors.add(identity);

		try
		{
			const entries = Object.entries(object);
			return <div className = "phpdbg-zval">
				{entries.map(entry => zvalView(entry, ancestors))}
			</div>;
		}
		catch(error)
		{
			console.error('Failed to render debugger value', error, object);
			return <div className = "phpdbg-zval phpdbg-zval-error">[Unrenderable]</div>;
		}
		finally
		{
			object && ancestors.delete(identity);
		}
	};

	const zvalView = ([name, zval], ancestors) => {
		return <label key = {name}>
			<div className='variable-name bevel'>{name}:&nbsp;</div>
			<div className='variable-value'>{(zval && typeof zval === 'object') ? zvalViews(zval, ancestors) : String(zval)}</div>
		</label>;
	};

	return (<div className={'phpdbg ' + className}>
		<div className='phpdbg-left-panel'>
			<div className='phpdbg-console' ref = {terminal} onMouseUp={handleTerminalClicked}>
				<div className='console-output'>
					<div className='scroll-to-bottom' onClick={handleScrollToBottom}>&#x1F847;</div>
					<span className = "warning">⚠️ <i>This is in VERY early alpha!</i> ⚠️</span>
					{output.map((line, index) => (<div className = 'line' data-type = {line.type} key = {index} dangerouslySetInnerHTML = {{__html: line.text}} ></div>))}
					<div className = 'console-input' data-ready = {ready} onClick={focusInput}>
						{!ready && (<img src = {loading} alt = "loading" />)}
						<span dangerouslySetInnerHTML = {{__html:prompt}}></span>
						<input autoFocus = {true} disabled={!ready} autoComplete="off" name = "stdin" onKeyDown={checkEnter} ref = {stdIn} />
						<button onClick = {runCommand}>&gt;</button>
					</div>
				</div>
			</div>
		</div>
		<div className='phpdbg-right-panel' data-current-panel = {currentPanel}>
			<div className = "row toolbar tight">
				<button onClick = {() => updateExecutionPanel('variables')}>vars</button>
				<button onClick = {() => updateExecutionPanel('globals')}>globals</button>
				<button onClick = {() => updateExecutionPanel('constants')}>constants</button>
				<button onClick = {() => updateExecutionPanel('classes')}>classes</button>
				<button onClick = {() => updateExecutionPanel('functions')}>functions</button>
				<button onClick = {() => updateExecutionPanel('files')}>files</button>
				<button onClick = {() => updateExecutionPanel('trace')}>trace</button>
			</div>
			<div className='phpdbg-panel-frame inset'>
				<div className='phpdbg-panel-frame-inner'>
					<div className='phpdbg-panel phpdbg-variables'>
						{zvalViews(variables)}
					</div>
					<div className='phpdbg-panel phpdbg-globals'>
						{zvalViews(globals)}
					</div>
					<div className='phpdbg-panel phpdbg-constants'>
						{zvalViews(constants)}
					</div>
					<div className='phpdbg-panel phpdbg-classes'>
						{Object.entries(userClasses).sort((a, b) => String(a[0]).localeCompare(b[0])).map(([name, func]) => {
							return <div key={name} title = {func.filename + ':' + func.lineNo} onClick = {() => openFile(func.filename, func.lineNo)}>
								<span>{name} <span className='filename'>{String(func.filename).split('/').pop()}:{func.lineNo}</span></span>
							</div>;
						})}
					</div>
					<div className='phpdbg-panel phpdbg-functions'>
						{Object.entries(functions).sort((a, b) => String(a[0]).localeCompare(b[0])).map(([name, func]) => {
							return <div key={name} title = {func.filename + ':' + func.lineNo} onClick = {() => openFile(func.filename, func.lineNo)}>
								<span>{name} <span className='filename'>{String(func.filename).split('/').pop()}:{func.lineNo}</span></span>
							</div>;
						})}
					</div>
					<div className='phpdbg-panel phpdbg-files'>
						{includedFiles.sort((a, b) => String(a).localeCompare(b)).map(name => {
							return <div key={name} onClick = {() => openFile(name)}>
								<span>{name}</span>
							</div>;
						})}
					</div>
					<div className='phpdbg-panel phpdbg-trace'>
						{trace.map((frame) => {
							return <div key={frame.frame} className={currentFrame === frame.frame ? 'current-frame': ''} onClick = {async () => {
								openFile(frame.filename, frame.lineNo);
								(await phpRef.current).switchFrame(frame.frame);
								setCurrentFrame(frame.frame);
							}}>
								<span>{frame.filename}: {frame.lineNo}</span>
							</div>;
						})}
					</div>
				</div>
			</div>
		</div>
	</div>);
});
