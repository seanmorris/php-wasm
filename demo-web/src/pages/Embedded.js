/**
 * Embedded PHP playground page that runs ad-hoc code in php-wasm.
 */
import '../styles/Embedded.css';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';

import { PGlite } from '@electric-sql/pglite';

import { PhpWeb } from 'php-wasm/PhpWeb';
import Confirm from '../components/Confirm';
import { basePath, buildType, defaultPhpVersion } from '../lib/runtimePaths';
import 'ace-builds/src-noconflict/mode-php';
import 'ace-builds/src-noconflict/theme-monokai';

// import yaml from 'php-wasm-yaml';

const baseSharedLibs = [];
const canToggleExtensions = buildType === 'dynamic';
const toggleableModules = {};

const files = [
	{ parent: '/preload/test_www/', name: 'hello-world.php',     url: './scripts/hello-world.php' }
	, { parent: '/preload/test_www/', name: 'phpinfo.php',         url: './scripts/phpinfo.php' }
	, { parent: '/preload/',          name: 'list-extensions.php', url: './scripts/list-extensions.php' }
];

if(buildType === 'dynamic')
{
	toggleableModules['dom']       = import('php-wasm-dom');
	toggleableModules['gd']        = import('php-wasm-gd');
	toggleableModules['iconv']     = import('php-wasm-iconv');
	toggleableModules['intl']      = import('php-wasm-intl');
	toggleableModules['libxml']    = import('php-wasm-libxml');
	toggleableModules['yaml']      = import('php-wasm-yaml');
	toggleableModules['libzip']    = import('php-wasm-libzip');
	toggleableModules['mbstring']  = import('php-wasm-mbstring');
	toggleableModules['openssl']   = import('php-wasm-openssl');
	toggleableModules['simplexml'] = import('php-wasm-simplexml');
	toggleableModules['sqlite']    = import('php-wasm-sqlite');
	toggleableModules['xml']       = import('php-wasm-xml');
	toggleableModules['zlib']      = import('php-wasm-zlib');
}
else if(buildType === 'shared')
{
	baseSharedLibs.push(
		{name: 'libxml2.so',     url: new URL('php-wasm-libxml/libxml2.so',    import.meta.url)}
		, {name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so',         import.meta.url)}
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

	// files.push(
	// 	{ parent: '/preload/', name: 'icudt72l.dat', url: new URL('php-wasm-intl/icudt72l.dat', import.meta.url) }
	// );
}
else
{
	baseSharedLibs.push(
		{name: 'libcrypto.so', url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
		, {name: 'libssl.so',    url: new URL('php-wasm-openssl/libssl.so', import.meta.url)}
	);
}

const dynamicLibs = buildType === 'dynamic'
	? [await import('php-wasm-yaml')]
	: [];

const ini = `
date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
expose_php=0
display_errors = Off
display_startup_errors = Off

log_errors = On
error_log = /dev/stderr
`;

/**
 * Extracts optional demo settings encoded in the first line of a PHP snippet.
 */
const parseDemoSettings = phpCode => {
	const firstLine = String(phpCode.split(/\n/).shift());
	const settings = {};

	try
	{
		Object.assign(settings, JSON.parse(firstLine.split('//').pop()));
	}
	catch
	{}

	return settings;
};

/**
 * Renders the embeddable PHP editor, output panes, and extension toggles.
 */
function Embedded()
{
	const phpRef = useRef(null);
	const runtimeCleanup = useRef(null);
	const bootTimeout = useRef(null);
	const autorunTimeout = useRef(null);
	const selectDemoBox = useRef(null);
	const selectVersionBox = useRef(null);
	const selectVariantBox = useRef(null);
	const htmlRadio = useRef(null);
	const textRadio = useRef(null);
	const editor = useRef(null);
	const initialQueryCode = useMemo(
		() => decodeURIComponent((new URLSearchParams(window.location.search)).get('code') || '')
		, []
	);
	const input = useRef(initialQueryCode);
	const persist = useRef('');
	const single = useRef('');
	const canvasCheckbox = useRef('');
	const canvas = useRef(null);
	const sharedLibs = useRef([...baseSharedLibs]);
	const [extensionsAvailable, setExtensionsAvailable] = useState(0);
	const [extensionsEnabled, setExtensionsEnabled] = useState(0);

	const toggleable = useRef(Object.fromEntries(
		Object.entries(toggleableModules).map(([name, module]) => [name, {active: false, module}])
	));

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [editorValue, setEditorValue] = useState(initialQueryCode);
	const [exitCode, setExitCode] = useState('');
	const [stdOut, setStdOut] = useState('');
	const [stdErr, setStdErr] = useState('');
	const [stdRet, setStdRet] = useState('');
	const [overlay, setOverlay] = useState(null);
	const [isIframe] = useState(!!Number(query.get('iframed')));
	const [showCanvas, setShowCanvas] = useState(true);

	const [running, setRunning] = useState(false);
	const [displayMode, setDisplayMode] = useState('');
	const [outputMode, setOutputMode] = useState('');
	const [statusMessage, setStatusMessage] = useState('php-wasm');

	const onOutput = useCallback(event => {
		setStdOut(stdOut => String(stdOut || '') + event.detail.join(''));
	}, []);

	const onError = useCallback(event => {
		setStdErr(stdErr => String(stdErr || '') + event.detail.join(''));
	}, []);

	const clearPendingAutorun = useCallback(() => {
		if(autorunTimeout.current)
		{
			clearTimeout(autorunTimeout.current);
			autorunTimeout.current = null;
		}
	}, []);

	const disposePhp = useCallback(() => {
		clearPendingAutorun();

		if(runtimeCleanup.current)
		{
			runtimeCleanup.current();
			runtimeCleanup.current = null;
		}

		phpRef.current = null;
	}, [clearPendingAutorun]);

	const refreshPhp = useCallback(() => {
		disposePhp();

		const version = selectVersionBox.current?.value ?? defaultPhpVersion;
		const variant = selectVariantBox.current?.value ?? '';
		const runtimeSharedLibs = [...sharedLibs.current];

		const php = new PhpWeb({
			version
			, variant
			, sharedLibs: runtimeSharedLibs
			, dynamicLibs
			, files
			, ini
			, PGlite
			, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
			, canvas: canvas.current
		});

		phpRef.current = php;
		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		runtimeCleanup.current = () => {
			php.removeEventListener('output', onOutput);
			php.removeEventListener('error', onError);
		};

		return php;
	}, [disposePhp, onError, onOutput]);

	const loadExtensions = useCallback(async () => {
		if(!canToggleExtensions)
		{
			return;
		}

		const defaultExtensions = query.has('extensionFlags')
			? Number(query.get('extensionFlags'))
			: 0x1FDF;

		let index = 0;
		let enabled = 0;
		for(const toggle of Object.values(toggleable.current))
		{
			toggle.active = !!(defaultExtensions & 2**index);
			index++;

			if(toggle.active) enabled++;
		}

		setExtensionsAvailable(index);
		setExtensionsEnabled(enabled);

		sharedLibs.current = (await Promise.all(
			Object.values(toggleable.current)
				.filter(toggle => toggle.active)
				.map(toggle => toggle.module)
		)).map(module => module.default);
	}, [query]);

	const applySettings = useCallback(settings => {
		persist.current.checked = settings.persist ?? persist.current.checked;
		single.current.checked = settings['single-expression'] ?? single.current.checked;
		canvasCheckbox.current.checked = settings['canvas'] ?? canvasCheckbox.current.checked;
		selectVersionBox.current.value = settings['version'] ?? selectVersionBox.current.value ?? defaultPhpVersion;
		selectVariantBox.current.value = settings['variant'] ?? selectVariantBox.current.value ?? '';

		setOutputMode(single.current.checked ? 'single' : 'normal');
		setShowCanvas(canvasCheckbox.current.checked);

		if(settings['render-as'])
		{
			setDisplayMode(settings['render-as']);
			htmlRadio.current.checked = settings['render-as'] === 'html';
			textRadio.current.checked = settings['render-as'] !== 'html';
		}
	}, []);

	const codeChanged = useCallback(newValue => {
		input.current = newValue;
		setEditorValue(newValue);
	}, []);

	const refreshMem = useCallback(async () => {
		await phpRef.current.refresh();
	}, []);

	const runCode = useCallback(async (codeOverride = null) => {
		codeOverride = typeof codeOverride === 'string' ? codeOverride : null;

		setRunning(true);
		setStatusMessage('Executing...');

		if(!persist.current.checked)
		{
			setStdOut('');
			setStdErr('');
		}

		setStdRet('');

		let code = codeOverride ?? editor.current?.editor?.getValue() ?? input.current ?? editorValue;

		const version = selectVersionBox.current?.value;
		const variant = selectVariantBox.current?.value;

		code = code.replace(/^<\?php \/\/.+\n/, `<?php //${JSON.stringify({
			'autorun': true
			, 'persist': persist.current?.checked
			, 'single-expression': single.current?.checked
			, 'render-as': htmlRadio.current?.checked ? 'html' : 'text'
			// 'extensionFlags': 0
			, 'canvas': canvasCheckbox.current?.checked
			, 'version': version
			, 'variant': variant
		})}\n`);

		query.set('code', encodeURIComponent(code));
		query.set('version', encodeURIComponent(version));
		query.set('variant', encodeURIComponent(variant));

		window.history.replaceState({}, document.title, "?" + query.toString());

		if(single.current.checked)
		{
			code = code.replace(/^\s*<\?php/, '');
			code = code.replace(/\?>\s*/, '');

			try
			{
				const ret = await phpRef.current.exec(code);
				setStdRet(ret);
				if(!persist.current.checked)
				{
					await phpRef.current.refresh();
				}
			}
			catch(error)
			{
				console.error(error);
			}
			finally
			{
				setStatusMessage('php-wasm ready!');
				setRunning(false);
			}

			return;
		}

		try
		{
			const nextExitCode = await phpRef.current.run(code);
			setExitCode(nextExitCode);
			if(!persist.current.checked)
			{
				await phpRef.current.refresh();
			}
		}
		catch(error)
		{
			console.error(error);
		}
		finally
		{
			setStatusMessage('php-wasm ready!');
			setRunning(false);
		}
	}, [editorValue, query]);

	const loadDemo = useCallback(async demoName => {
		if(!demoName)
		{
			refreshPhp();
			await runCode();
			return;
		}

		if(demoName === 'drupal.php')
		{
			setOverlay(<Confirm
				onConfirm = {() => window.location = basePath('select-framework.html')}
				onCancel = {() => setOverlay(null)}
				message = {(
					<span>The Drupal demo has been moved into the <b>php-cgi-wasm</b> demo. Would you like to go there now?</span>
				)}
			/>);
			return;
		}

		setRunning(true);
		setStdOut('');
		setStdErr('');
		setStdRet('');

		const phpCode = await (await fetch(basePath(`scripts/${demoName}`))).text();
		const settings = parseDemoSettings(phpCode);

		input.current = phpCode;
		setEditorValue(phpCode);
		document.querySelector('#example').innerHTML = '';

		applySettings(settings);

		query.set('persist', persist.current.checked ? 1 : 0);
		query.set('single-expression', single.current.checked ? 1 : 0);

		if('extensionFlags' in settings)
		{
			query.set('extensionFlags', settings.extensionFlags);
		}

		if(phpCode.length < 1024)
		{
			query.set('code', encodeURIComponent(phpCode));
		}

		window.history.replaceState({}, document.title, "?" + query.toString());

		if(phpRef.current)
		{
			await phpRef.current.refresh();
		}

		await loadExtensions();
		refreshPhp();

		if(settings.autorun)
		{
			setStatusMessage('Executing...');
			await runCode(phpCode);
		}

		setShowCanvas(canvasCheckbox.current.checked);
		setOutputMode(single.current.checked ? 'single' : 'normal');
	}, [applySettings, loadExtensions, query, refreshPhp, runCode]);

	const initializeEmbedded = useEffectEvent(async () => {
		persist.current.checked = !!Number(query.get('persist') ?? '');
		single.current.checked = !!Number(query.get('single-expression') ?? '');
		selectVersionBox.current.value = query.get('version') ?? defaultPhpVersion;
		selectVariantBox.current.value = query.get('variant') ?? '';

		const settings = parseDemoSettings(initialQueryCode);
		applySettings(settings);

		if(query.has('demo'))
		{
			const demoName = query.get('demo');
			selectDemoBox.current.value = demoName;
			query.delete('demo');
			await loadDemo(demoName);
			return;
		}

		await loadExtensions();
		refreshPhp();

		if(settings.autorun)
		{
			clearPendingAutorun();
			autorunTimeout.current = setTimeout(() => {
				autorunTimeout.current = null;
				void runCode();
			}, 1);
		}
	});

	useEffect(() => {
		// Delay the one-shot boot so StrictMode's dev-only effect replay can
		// cancel the first mount before a demo autoruns twice in the same runtime.
		bootTimeout.current = setTimeout(() => {
			bootTimeout.current = null;
			void initializeEmbedded();
		}, 0);

		return () => {
			if(bootTimeout.current)
			{
				clearTimeout(bootTimeout.current);
				bootTimeout.current = null;
			}

			disposePhp();
		};
	}, [disposePhp]);

	const demoSelected = () => {
		void loadDemo(selectDemoBox.current.value);
	};

	useEffect(() => {
		const onKeyDown = event => {
			if(event.key === 'Enter' && event.ctrlKey)
			{
				void runCode();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [runCode]);

	const openFile = async event => {
		const file = event.target.files[0];

		if(!file)
		{
			return;
		}

		const contents = await file.text();
		input.current = contents;
		setEditorValue(contents);
	};

	const toggleExtension = async (event, name) => {
		if(!canToggleExtensions)
		{
			return;
		}

		if(!toggleable.current[name])
		{
			console.warn(`${name} is not a valid extension name`);
			return;
		}

		toggleable.current[name].active = event.target.checked;

		sharedLibs.current = (await Promise.all(
			Object.values(toggleable.current)
				.filter(toggle => toggle.active)
				.map(toggle => toggle.module)
		)).map(module => module.default);
	};

	const showExtensionDialog = () => {
		if(!canToggleExtensions)
		{
			return;
		}

		setOverlay(
			<div className = "toggleExtensions">
				<div className='bevel'>
					{Object.entries(toggleable.current).map(([name, toggle]) => {
						return <label key = {name} style = {{display: 'block'}}>
							<input type = "checkbox" defaultChecked = {toggle.active} onChange={event => toggleExtension(event, name)}/>
							{name}
						</label>;
					})}
					<div>
						<button className = "margin" onClick={closeExtensionsDialog}>Done</button>
					</div>
				</div>
			</div>
		);
	};

	const closeExtensionsDialog = async () => {
		if(!canToggleExtensions)
		{
			return;
		}

		const extensionFlags = Object.values(toggleable.current)
			.map((toggle, index) => !!toggle.active << index)
			.reduce((value, next) => value + next, 0);

		query.set('extensionFlags', extensionFlags);

		setOverlay(null);
		setStdOut('');
		setStdErr('');
		await loadExtensions();
		refreshPhp();
		await runCode();
	};

	const singleChanged = () => setOutputMode(single.current.checked ? 'single' : 'normal');
	const canvasChanged = () => setShowCanvas(canvasCheckbox.current.checked);
	const formatSelected = event => setDisplayMode(event.target.value);

	const topBar = (<div className = "row header toolbar">
		<div className = "cols">
			<div className = "row start selects">
				{isIframe || <span className = "contents">
					<a href = {basePath()}>
						<img src = "sean-icon.png" alt = "sean" />
					</a>
					<h1><a href = {basePath()}>php-wasm</a></h1>
					<hr />
				</span>}
				<label>
					<span>Demo:</span>
					<select data-select-demo ref = {selectDemoBox}>
						<option value = "">Select a Demo</option>
						<option value = "phpinfo.php">phpinfo();</option>
						<option value = "hello-world.php">Hello, World!</option>
						<option value = "dynamic-extension.php">Dynamic Extension Loading</option>
						<option value = "callbacks.php">Javascript Callbacks</option>
						<option value = "import.php">Import Javascript Modules</option>
						<option value = "curvature.php">Curvature</option>
						<option value = "fetch.php">Fetch</option>
						<option value = "promise.php">Promise</option>
						<option value = "persistent-memory.php">Persistent Memory</option>
						{isIframe || <option value = "dom-access.php">DOM Access</option>}
						<option value = "goto.php">GoTo</option>
						<option value = "stdio.php">StdOut, StdIn, & Return</option>
						<option value = "postgres.php">PostgreSQL</option>
						<option value = "sqlite.php">SQLite</option>
						<option value = "sqlite-pdo.php">SQLite (PDO)</option>
						<option value = "json.php">JSON</option>
						<option value = "closures.php">Closures</option>
						<option value = "files.php">Files</option>
						<option value = "sdl-sine.php">SDL</option>
						<option value = "zend-benchmark.php">Zend Benchmark</option>
						{isIframe || <option value = "drupal.php">Drupal 7</option>}
					</select>
				</label>
				<div className='row'>
					<label>
						<span>Version:</span>
						<select data-select-demo ref = {selectVersionBox}>
							<option value = "8.5">8.5</option>
							<option value = "8.4">8.4</option>
							<option value = "8.3">8.3</option>
							<option value = "8.2">8.2</option>
							<option value = "8.1">8.1</option>
							<option value = "8.0">8.0</option>
						</select>
					</label>
					<label>
						<span>Variant:</span>
						<select data-select-demo ref = {selectVariantBox}>
							<option value = "">base</option>
							<option value = "_sdl">sdl</option>
						</select>
					</label>
				</div>
				<div className = "row">
					<label>
						<span>&nbsp;</span>
						<button data-load-demo onClick = {demoSelected}>load</button>
					</label>
					{canToggleExtensions && (<label>
						<span>&nbsp;</span>
						<button data-toggle-extensions onClick = {showExtensionDialog}>
							extensions ({extensionsEnabled}/{extensionsAvailable})
						</button>
					</label>)}
				</div>
			</div>
		</div>
		<div className = "separator"></div>
		<div className = "row flex-end">
			<hr />
			<div className = "rows spread">
				<label>
					<span>text</span>
					<input value = "text" type = "radio" name = "render-as" onChange = {formatSelected} ref = {textRadio} />
				</label>
				<label>
					<span>html</span>
					<input value = "html" type = "radio" name = "render-as" onChange = {formatSelected} ref = {htmlRadio} />
				</label>
			</div>
			&nbsp;
			<div className = "rows spread">
				<label>
					<span>Persist Memory</span>
					<input type = "checkbox" id = "persist" ref = {persist} />
				</label>
				<label>
					<span>Single Expression</span>
					<input type = "checkbox" id = "singleExpression" ref = {single} onChange = {singleChanged} />
				</label>
				<label>
					<span>Show Canvas</span>
					<input type = "checkbox" id = "singleExpression" ref = {canvasCheckbox} onChange = {canvasChanged} />
				</label>
			</div>
			<div className = "row">
				<button data-ui data-refresh onClick = {refreshMem}><span>refresh</span></button>
				<button data-ui data-run onClick = {runCode}><span>run</span></button>
			</div>
		</div>
	</div>);

	const statusBar = (<div className = "row status toolbar">
		<div>
			<div className = "row start" data-status>
				{statusMessage}
			</div>
		</div>
		<div></div>
	</div>);

	return (<div className="Embedded margined" data-display-mode = {displayMode} data-output-mode = {outputMode} data-running = {running ? 1 : 0} data-iframed = {isIframe ? 1 : 0}>
		<div className='bevel column'>
			{topBar}
			<div className = "row body">
				<div className = "panel">
					<div className = "input">
						<div className = "cols">
							<label tabIndex="-1">
								<img src = "php.png" alt = "php" /> <span>PHP Code</span>
							</label>
							<label id = "openFile" className = "collapse" tabIndex="-1">
								open file<input type = "file" accept=".php" onChange = {openFile} />
							</label>
						</div>
						<div className = "liquid" id = "input-box">
							<AceEditor
								height = "100%"
								mode = "php"
								name = "input"
								onChange = {codeChanged}
								ref = {editor}
								theme = "monokai"
								value = {editorValue}
								width = "100%"
							/>
						</div>
					</div>
				</div>

				<div className = "panel">
					<section id = "example-wrapper">
						<div id = "example"></div>
					</section>
					<div style = {showCanvas ? {} : {display: "none"}}>
						<div className = "cols">
							<label tabIndex="-1">canvas</label>
						</div>
						<div className = "canvas output liquid" >
							<div className = "column">
								<canvas ref={canvas} />
							</div>
						</div>
					</div>
					<div id = "ret">
						<div className = "cols">
							<label tabIndex="-1">return</label>
						</div>
						<div className = "stdret output liquid">
							<div className = "column">
								<iframe srcDoc = {stdRet} title = "output" sandbox = "allow-scripts allow-forms allow-popups" className = "scroller"></iframe>
								<div className = "scroller">{stdRet}</div>
							</div>
						</div>
					</div>
					<div>
						<div className = "cols">
							<label tabIndex="-1">stdout</label>
							<label id = "exit" className = "collapse" tabIndex="-1">exit code: {exitCode}<span></span></label>
						</div>
						<div className = "stdout output liquid">
							<div className = "column">
								<iframe srcDoc = {stdOut} title = "output" sandbox = "allow-scripts allow-forms allow-popups" className = "scroller"></iframe>
								<div className = "scroller">{stdOut}</div>
							</div>
						</div>
					</div>
					<div>
						<div className = "cols">
							<label tabIndex="-1">stderr</label>
						</div>
						<div className = "stderr output liquid">
							<div className = "column">
								<iframe srcDoc = {stdErr} title = "output" sandbox = "allow-scripts allow-forms allow-popups" className = "scroller"></iframe>
								<div className = "scroller">{stdErr}</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			{statusBar}
		</div>
		<div className = "overlay">{overlay}</div>
	</div>
	);
}

export default Embedded;
