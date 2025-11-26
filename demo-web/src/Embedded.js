import './Embedded.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from "react-ace-builds";
import "react-ace-builds/webpack-resolver-min";

import { PGlite } from '@electric-sql/pglite';

import { PhpWeb } from 'php-wasm/PhpWeb';
import { createRoot } from 'react-dom/client';
import Confirm from './Confirm';

// import yaml from 'php-wasm-yaml';
import sdl from 'php-wasm-sdl';

const sharedLibs = [];

const buildType = process.env.REACT_APP_BUILD_TYPE ?? 'dynamic';

const files = [
	{ parent: '/preload/test_www/', name: 'hello-world.php',     url: './scripts/hello-world.php' },
	{ parent: '/preload/test_www/', name: 'phpinfo.php',         url: './scripts/phpinfo.php' },
	{ parent: '/preload/',          name: 'list-extensions.php', url: './scripts/list-extensions.php' },
];

if(buildType === 'dynamic')
{
	sharedLibs.push(...(await Promise.all([
		import('php-wasm-libxml'),
		import('php-wasm-dom'),
		import('php-wasm-xml'),
		import('php-wasm-simplexml'),
		import('php-wasm-zlib'),
		import('php-wasm-libzip'),
		import('php-wasm-gd'),
		import('php-wasm-iconv'),
		import('php-wasm-intl'),
		import('php-wasm-openssl'),
		import('php-wasm-mbstring'),
		import('php-wasm-sqlite'),
	])).map(m => m.default));
}
else if(buildType === 'shared')
{
	files.push(
		{ parent: '/preload/', name: 'icudt72l.dat', url: new URL('php-wasm-intl/icudt72l.dat', import.meta.url) }
	);

	sharedLibs.push(
		{name: 'libxml2.so',     url: new URL('php-wasm-libxml/libxml2.so',    import.meta.url)},
		{name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so',         import.meta.url)},
		{name: 'libzip.so',      url: new URL('php-wasm-libzip/libzip.so',     import.meta.url)},
		{name: 'libfreetype.so', url: new URL('php-wasm-gd/libfreetype.so',    import.meta.url)},
		{name: 'libjpeg.so',     url: new URL('php-wasm-gd/libjpeg.so',        import.meta.url)},
		{name: 'libwebp.so',     url: new URL('php-wasm-gd/libwebp.so',        import.meta.url)},
		{name: 'libpng.so',      url: new URL('php-wasm-gd/libpng.so',         import.meta.url)},
		{name: 'libiconv.so',    url: new URL('php-wasm-iconv/libiconv.so',    import.meta.url)},
		{name: 'libicuuc.so',    url: new URL('php-wasm-intl/libicuuc.so',     import.meta.url)},
		{name: 'libicutu.so',    url: new URL('php-wasm-intl/libicutu.so',     import.meta.url)},
		{name: 'libicutest.so',  url: new URL('php-wasm-intl/libicutest.so',   import.meta.url)},
		{name: 'libicuio.so',    url: new URL('php-wasm-intl/libicuio.so',     import.meta.url)},
		{name: 'libicui18n.so',  url: new URL('php-wasm-intl/libicui18n.so',   import.meta.url)},
		{name: 'libicudata.so',  url: new URL('php-wasm-intl/libicudata.so',   import.meta.url)},
		{name: 'libcrypto.so',   url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)},
		{name: 'libssl.so',      url: new URL('php-wasm-openssl/libssl.so',    import.meta.url)},
		{name: 'libonig.so',     url: new URL('php-wasm-mbstring/libonig.so',  import.meta.url)},
		{name: 'libsqlite3.so',  url: new URL('php-wasm-sqlite/libsqlite3.so', import.meta.url)},
		{name: 'libtidy.so',     url: new URL('php-wasm-tidy/libtidy.so',      import.meta.url)},
		{name: 'libyaml.so',     url: new URL('php-wasm-yaml/libyaml.so',      import.meta.url)},
	);
}
else
{
	sharedLibs.push(
		{name: 'libcrypto.so', url: (new URL('php-wasm-openssl/libcrypto.so', import.meta.url))},
		{name: 'libssl.so',    url: (new URL('php-wasm-openssl/libssl.so', import.meta.url))},
	);
}

const dynamicLibs = [
	await import('php-wasm-yaml')
];

const ini = `
date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
expose_php=0
display_errors = Off
display_startup_errors = Off

log_errors = On
error_log = /dev/stderr
`;

function Embedded() {
	const init = useRef(false);
	const phpRef = useRef(null);
	const inputBox = useRef(null);
	const selectDemoBox = useRef(null);
	const selectVersionBox = useRef(null);
	const selectVariantBox = useRef(null);
	const htmlRadio = useRef(null);
	const textRadio = useRef(null);
	const editor = useRef(null);
	const input = useRef('');
	const persist = useRef('');
	const single  = useRef('');
	const canvasCheckbox = useRef('');
	const canvas  = useRef(null);
	// const stdin  = useRef('');

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [exitCode, setExitCode] = useState('');
	const [stdOut, setStdOut] = useState('');
	const [stdErr, setStdErr] = useState('');
	const [stdRet, setStdRet] = useState('');
	const [overlay, setOverlay] = useState(null);
	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));
	const [showCanvas, setShowCanvas] = useState(true);

	const [running, setRunning] = useState(false);
	const [displayMode, setDisplayMode] = useState('');
	const [outputMode, setOutputMode] = useState('');
	const [statusMessage, setStatusMessage] = useState('php-wasm');

	const onOutput = event => setStdOut(stdOut => String(stdOut || '') + event.detail.join(''));
	const onError  = event => setStdErr(stdErr => String(stdErr || '') + event.detail.join(''));

	const refreshPhp = useCallback(() => {
		const version = (selectVersionBox.current ? selectVersionBox.current.value : '8.4') ?? '8.4';
		const variant = (selectVariantBox.current ? selectVariantBox.current.value : '') ?? '';

		const _sharedLibs = [...sharedLibs];

		if(variant === '_sdl' && buildType === 'dynamic')
		{
			_sharedLibs.push(sdl);
		}

		phpRef.current = new PhpWeb({
			version,
			variant,
			sharedLibs: _sharedLibs,
			dynamicLibs,
			files,
			ini,
			PGlite,
			persist: [{mountPath:'/persist'}, {mountPath:'/config'}],
			canvas: canvas.current,
		});

		const php = phpRef.current;

		php.addEventListener('output', onOutput);
		php.addEventListener('error', onError);

		return () => {
			php.removeEventListener('output', onOutput);
			php.removeEventListener('error', onError);
		};
	}, []);

	useEffect(() => {
		persist.current.checked = !!Number(query.get('persist')) ?? '';
		single.current.checked = !!Number(query.get('single-expression')) ?? '';
		selectVersionBox.current.value = query.get('version') ?? '8.4';
		selectVariantBox.current.value = query.get('variant') ?? '';

		if(!init.current && !query.has('demo'))
		{
			refreshPhp();
		}
		init.current = true;
	}, [refreshPhp]);

	const singleChanged = () => setOutputMode(single.current.checked ? 'single' : 'normal');
	const canvasChanged = () => setShowCanvas(canvasCheckbox.current.checked);
	const formatSelected = event => setDisplayMode(event.target.value);
	const codeChanged = newValue => input.current = newValue;

	const refreshMem = useCallback(async () => {
		await phpRef.current.refresh();
	});

	const runCode = useCallback(async () => {
		setRunning(true);

		setStatusMessage('Executing...');

		if(!persist.current.checked)
		{
			setStdOut('');
			setStdErr('');
		}

		setStdRet('');

		let code = editor.current.editor.getValue();

		const version = selectVersionBox.current?.value;
		const variant = selectVariantBox.current?.value;

		code = code.replace(/^<\?php \/\/.+\n/, `<?php //${JSON.stringify({
			'autorun': true,
			'persist': persist.current?.checked,
			'single-expression': single.current?.checked,
			'render-as': htmlRadio.current?.checked ? 'html' : 'text',
			'canvas': canvasCheckbox.current?.checked,
			'version': version,
			'variant': variant,
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
				setStatusMessage('php-wasm ready!')
				setRunning(false);
			}
		}
		else
		{
			try
			{
				const exitCode = await phpRef.current.run(code);
				setExitCode(exitCode);
				if(!persist.current.checked)
				{
					await phpRef.current.refresh();
				}
			}
			catch(error)
			{
				console.error(error)
			}
			finally
			{
				setStatusMessage('php-wasm ready!')
				setRunning(false);
			}
		}
	}, [query]);

	const loadDemo = useCallback(demoName => {

		if(!demoName)
		{
			return;
		}

		if(demoName === 'drupal.php')
		{
			setOverlay(<Confirm
				onConfirm = { () => window.location = process.env.PUBLIC_URL + '/select-framework.html' }
				onCancel = { () => setOverlay(null) }
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

		fetch(process.env.PUBLIC_URL + '/scripts/' + demoName)
		.then(response => response.text())
		.then(async phpCode => {
			editor.current.editor.setValue(phpCode, -1);

			document.querySelector('#example').innerHTML = '';
			const firstLine = String(phpCode.split(/\n/).shift());
			const settings  = JSON.parse(firstLine.split('//').pop()) || {};

			persist.current.checked = settings.persist ?? persist.current.checked;
			single.current.checked = settings['single-expression'] ?? single.current.checked;
			canvasCheckbox.current.checked = settings['canvas'] ?? false;
			selectVersionBox.current.value = settings['version'] ?? selectVersionBox.current.value ?? '8.4';
			selectVariantBox.current.value = settings['variant'] ?? selectVariantBox.current.value ?? '';

			if(settings['render-as'])
			{
				setDisplayMode(settings['render-as']);
				htmlRadio.current.checked = settings['render-as'] === 'html';
				textRadio.current.checked = settings['render-as'] !== 'html';
			}

			query.set('persist', persist.current.checked ? 1 : 0);
			query.set('single-expression', single.current.checked ? 1 : 0);

			if(phpCode.length < 1024)
			{
				query.set('code', encodeURIComponent(phpCode));
			}

			window.history.replaceState({}, document.title, "?" + query.toString());

			refreshPhp();

			if(settings.autorun)
			{
				setStatusMessage('Executing...');
				runCode();
			}

			setShowCanvas(canvasCheckbox.current.checked);
			setOutputMode(single.current.checked ? 'single' : 'normal');
		});
	}, [query, refreshPhp, runCode]);

	useEffect(() => {
		if(inputBox.current)
		{
			return;
		}

		inputBox.current = document.getElementById('input-box');

		const inputRoot = createRoot(inputBox.current);
		const queryCode = query.get('code') || '';

		const decodedCode = decodeURIComponent(queryCode);

		input.current = decodedCode;
		inputRoot.render(
			<AceEditor
				mode = "php"
				theme = "monokai"
				onChange = {codeChanged}
				name = "input"
				width = "100%"
				height = "100%"
				ref = {editor}
				value = {decodedCode}
			/>
		);
		const firstLine = String(decodedCode.split(/\n/).shift());
		const settings  = {};

		try
		{
			Object.assign(settings, JSON.parse(firstLine.split('//').pop()));
		}
		catch
		{}

		persist.current.checked = settings.persist ?? persist.current.checked;
		single.current.checked = settings['single-expression'] ?? single.current.checked;
		canvasCheckbox.current.checked = settings['canvas'] ?? canvasCheckbox.current.checked;

		setOutputMode(single.current.checked ? 'single' : 'normal');
		setShowCanvas(canvasCheckbox.current.checked);

		if(settings['render-as'])
		{
			setDisplayMode(settings['render-as']);

			htmlRadio.current.checked = settings['render-as'] === 'html';
			textRadio.current.checked = settings['render-as'] !== 'html';
		}

		if(editor.current && query.has('code'))
		{
			editor.current.editor.setValue(query.has('code'), -1);
		}
		else if(query.has('demo'))
		{
			const demoName = query.get('demo');
			selectDemoBox.current.value = demoName;
			loadDemo(demoName);
			query.delete('demo');
		}

		if(settings.autorun)
		{
			setTimeout(runCode, 1);
		}

	}, [query, loadDemo, runCode]);

	const demoSelected = () => loadDemo(selectDemoBox.current.value);

	const onKeyDown = event => {
		if(event.key === 'Enter' && event.ctrlKey)
		{
			runCode();
			return;
		}
	};

	useEffect(() => {

		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		}
	}, []);

	const openFile = async event => {
		const file = event.target.files[0];
		editor.current.editor.setValue(await file.text(), -1);;
	};

	const topBar = (<div className = "row header toolbar">
		<div className = "cols">
			<div className = "row start selects">
				{isIframe || <span className = "contents">
					<a href = { process.env.PUBLIC_URL || "/" }>
						<img src = "sean-icon.png" alt = "sean" />
					</a>
					<h1><a href = { process.env.PUBLIC_URL || "/" }>php-wasm</a></h1>
					<hr />
				</span>}
				<label>
					<span>Demo:</span>
					<select data-select-demo ref = {selectDemoBox}>
						<option value = "">Select a Demo</option>
						<option value = "hello-world.php">Hello, World!</option>
						<option value = "dynamic-extension.php">Dynamic Extension Loading</option>
						<option value = "callbacks.php">Javascript Callbacks</option>
						<option value = "import.php">Import Javascript Modules</option>
						<option value = "curvature.php">Curvature</option>
						<option value = "phpinfo.php">phpinfo();</option>
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
				<label>
					<span>Version:</span>
						<select data-select-demo ref = {selectVersionBox}>
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
				<label>
					<span>&nbsp;</span>
					<button data-load-demo onClick = {demoSelected}>load</button>
				</label>
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
					<input type = "checkbox" id = "persist" ref = { persist } />
				</label>
				<label>
					<span>Single Expression</span>
					<input type = "checkbox" id = "singleExpression" ref = { single } onChange = {singleChanged} />
				</label>
				<label>
					<span>Show Canvas</span>
					<input type = "checkbox" id = "singleExpression" ref = { canvasCheckbox } onChange = {canvasChanged} />
				</label>
			</div>
			<button data-ui data-refresh onClick = { refreshMem }><span>refresh</span></button>
			<button data-ui data-run onClick = { runCode }><span>run</span></button>
		</div>
	</div>);

	const statusBar = (<div className = "row status toolbar">
		<div>
			<div className = "row start" data-status>
				{statusMessage}
			</div>
		</div>
		<div>
		</div>
	</div>);

	return (<div className="Embedded margined" data-display-mode = {displayMode} data-output-mode = {outputMode} data-running = {running ? 1: 0} data-iframed = {isIframe ? 1 : 0}>
		<div className='bevel column'>
			{topBar}
			<div className = "row body">
				<div className = "panel">
					<div className = "input">
						<div className = "cols">
							<label tabIndex="-1">
								<img src = "php.png" alt = "php" /> <span>PHP Code</span>
							</label>
							<label id = "openFile" className = "collapse"tabIndex="-1">
								open file<input type = "file" accept=".php" onChange = {openFile} />
							</label>
						</div>
						<div className = "liquid" id = "input-box"></div>
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
