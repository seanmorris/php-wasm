/**
 * Browser terminal component backed by php-cli-wasm.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PhpCliWeb } from 'php-cli-wasm/PhpCliWeb';
import { PGlite } from '@electric-sql/pglite';
import '../styles/dbg-preview.css';
import loading from '../assets/ui/loading.svg';
import Convert from 'ansi-to-html';
import { buildType } from '../lib/runtimePaths';

// import libxml from 'php-wasm-libxml';

const parser = new Convert();
/**
 * Default callback used for optional terminal event handlers.
 */
const noop = () => {};

const defaultSharedLibs = [
	// libxml
];

const emptySharedLibs = [];

if(buildType === 'dynamic')
{
	defaultSharedLibs.push(...(await Promise.all([
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
		, import('php-wasm-tidy')
		, import('php-wasm-yaml')
	])).map(module => module.default));
}
else if(buildType === 'shared')
{
	defaultSharedLibs.push(
		{name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so',         import.meta.url)}
		, {name: 'libzip.so',      url: new URL('php-wasm-libzip/libzip.so',     import.meta.url)}
		, {name: 'libfreetype.so', url: new URL('php-wasm-gd/libfreetype.so',    import.meta.url)}
		, {name: 'libjpeg.so',     url: new URL('php-wasm-gd/libjpeg.so',        import.meta.url)}
		, {name: 'libwebp.so',     url: new URL('php-wasm-gd/libwebp.so',        import.meta.url)}
		, {name: 'libpng.so',      url: new URL('php-wasm-gd/libpng.so',         import.meta.url)}
		, {name: 'libiconv.so',    url: new URL('php-wasm-iconv/libiconv.so',    import.meta.url)}
		, {name: 'libicuuc.so',    url: new URL('php-wasm-intl/libicuuc.so',     import.meta.url)}
		, {name: 'libicutu.so',    url: new URL('php-wasm-intl/libicutu.so',     import.meta.url)}
		, {name: 'libicutest.so',  url: new URL('php-wasm-intl/libicutest.so',   import.meta.url)}
		, {name: 'libicuio.so',    url: new URL('php-wasm-intl/libicuio.so',     import.meta.url)}
		, {name: 'libicui18n.so',  url: new URL('php-wasm-intl/libicui18n.so',   import.meta.url)}
		, {name: 'libcrypto.so',   url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
		, {name: 'libssl.so',      url: new URL('php-wasm-openssl/libssl.so',    import.meta.url)}
		, {name: 'libonig.so',     url: new URL('php-wasm-mbstring/libonig.so',  import.meta.url)}
		, {name: 'libsqlite3.so',  url: new URL('php-wasm-sqlite/libsqlite3.so', import.meta.url)}
		, {name: 'libtidy.so',     url: new URL('php-wasm-tidy/libtidy.so',      import.meta.url)}
		, {name: 'libyaml.so',     url: new URL('php-wasm-yaml/libyaml.so',      import.meta.url)}
	);
}
const ini = `
date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
expose_php=0
display_errors = Off
display_startup_errors = Off

log_errors = On
error_log = /dev/stderr
`;

/**
 * Escapes terminal output before converting ANSI sequences to HTML.
 */
const escapeHtml = string => string
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#039;");

/**
 * Shared php-cli runtime arguments used by every terminal instance.
 */
const phpArgs = {
	version: '8.3'
	, ini
	, PGlite
	, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
	// , script: '/preload/hello-world.php'
	// , code: 'echo "Hello, PHP-CLI!";'
	// , interactive: false
};

/**
 * Renders an interactive or scripted PHP CLI session inside the demo shell.
 */
export default function Terminal({
	setStatusMessage = noop
	, setExitCode = noop
	, localEcho = true
	, onStdIn
	, sharedLibs = emptySharedLibs
	, interactive
	, script
	, code
	, extras
}) {
	const phpRef = useRef(null);
	const cmdStack = useRef(['']);
	const cmdStackIndex = useRef(0);
	const onStdInRef = useRef(onStdIn);
	const setStatusMessageRef = useRef(setStatusMessage);
	const setExitCodeRef = useRef(setExitCode);
	const terminal = useRef('');
	const stdIn  = useRef('');
	const timeout = useRef(null);

	const [ready, setReady] = useState(false);
	const [output, setOutput] = useState([]);
	const [prompt] = useState(parser.toHtml(escapeHtml('\x1b[1mphp> '))); // @TODO: get the prompt from PHP

	const interactiveMode = interactive && !script && !code;

	const scrollToEnd = useCallback(() => {
		if(timeout.current)
		{
			clearTimeout(timeout.current);
		}

		if(!stdIn.current)
		{
			timeout.current = setTimeout(() => {
				terminal.current?.scrollTo({
					top: terminal.current.scrollHeight
					, behavior: 'smooth'
				});
			}, 32);
			return;
		}

		timeout.current = setTimeout(() => stdIn.current.scrollIntoView(), 32);
	}, []);

	const focusInput = useCallback(() => {
		if(!phpRef.current?.interactive)
		{
			scrollToEnd();
			return;
		}

		if(window.getSelection().toString() === '')
		{
			stdIn.current?.focus();
		}
	}, [scrollToEnd]);

	useEffect(() => {
		onStdInRef.current = onStdIn;
	}, [onStdIn]);

	useEffect(() => {
		setStatusMessageRef.current = setStatusMessage;
		setExitCodeRef.current = setExitCode;
	}, [setExitCode, setStatusMessage]);

	const refreshPhp = useCallback(() => {
		let active = true;
		let launchTimeout = null;

		setStatusMessageRef.current?.('loading...');

		const onOutput = async event => {
			if(!active)
			{
				return;
			}

			const newOutput = event.detail.map(text => text
				.replace('\n', '\u240A\n')
				.replace('\r', '\u240D'));

			const ansi = newOutput.map(line => {
				return { type: 'stdout', text: parser.toHtml(escapeHtml(line)) };
			});

			setOutput(output => [...output, ...ansi]);
			scrollToEnd();
		};

		const onError = async event => {
			if(!active)
			{
				return;
			}

			const newOutput = event.detail.map(text => text
				.replace('\n', '\u240A\n')
				.replace('\r', '\u240D'));

			const ansi = newOutput.map(line => {
				return { type: 'stderr', text: parser.toHtml(escapeHtml(line)) };
			});

			setOutput(output => [...output, ...ansi]);
			scrollToEnd();
		};

		const php = new PhpCliWeb({
			...extras
			, ...phpArgs
			, sharedLibs: [...sharedLibs, ...defaultSharedLibs]
			, interactive: interactiveMode
			, script
			, code
		});

		phpRef.current = php;
		setReady(interactiveMode);

		const firstInput = async () => {
			setStatusMessageRef.current?.('php-cli-wasm ready!');
			setReady(true);
			await new Promise(resolve => setTimeout(resolve, 10));
			focusInput();
		};

		const onStdInHandler = event => {
			onStdInRef.current && onStdInRef.current(event);
		};

		const once = {once: true};

		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		if(interactiveMode)
		{
			php.addEventListener('stdin-request', onStdInHandler);
			php.addEventListener('stdin-request', firstInput, once);
		}
		else
		{
			setStatusMessageRef.current?.('php-cli-wasm running...');
		}

		const runPhp = async () => {
			await php.binary;

			if(!active)
			{
				return;
			}

			const ret = await php.run(['-c', '/php.ini']);

			if(!active)
			{
				return;
			}

			if(interactiveMode)
			{
				setStatusMessageRef.current?.('php-cli-wasm ready!');
			}
			else
			{
				setStatusMessageRef.current?.('php-cli-wasm done.');
				setExitCodeRef.current?.(ret);
			}
		};

		// Delay the CLI start so StrictMode's dev-only effect replay can cancel
		// the first mount before a one-shot script executes twice.
		launchTimeout = setTimeout(() => void runPhp(), 0);

		return () => {
			active = false;

			if(launchTimeout)
			{
				clearTimeout(launchTimeout);
				launchTimeout = null;
			}

			if(timeout.current)
			{
				clearTimeout(timeout.current);
				timeout.current = null;
			}

			php.removeEventListener('output', onOutput);
			php.removeEventListener('error', onError);

			if(interactiveMode)
			{
				php.removeEventListener('stdin-request', onStdInHandler);
				php.removeEventListener('stdin-request', firstInput, once);
			}

			if(phpRef.current === php)
			{
				phpRef.current = null;
			}
		};
	}, [code, extras, focusInput, interactiveMode, script, scrollToEnd, sharedLibs]);

	useEffect(() => {
		return refreshPhp();
	}, [refreshPhp]);

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
			setOutput(output => [...output, {text: `<span>${prompt}</span><span>${inputValue}</span>`, type: 'stdin'}]);
			scrollToEnd();
		}

		await php.provideInput(inputValue);
		stdIn.current?.focus();
	}, [localEcho, prompt, scrollToEnd]);

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

	return (<div className='phpdbg-console inset' onMouseUp={handleTerminalClicked} ref = {terminal}>
		<div className='scroll-to-bottom' onClick={handleScrollToBottom}>&#x1F847;</div>
		<div className='console-output'>
			{output.map((line, index) => (<div className = 'line' data-type = {line.type} key = {index} dangerouslySetInnerHTML = {{__html: line.text}} ></div>))}
			{interactiveMode && (
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
