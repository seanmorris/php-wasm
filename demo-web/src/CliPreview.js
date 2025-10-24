import React, { useMemo, useState } from 'react';
import './dbg-preview.css';
import Terminal from './Terminal';

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

export default function CliPreview() {

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [exitCode, setExitCode] = useState();
	const [statusMessage, setStatusMessage] = useState('php-wasm');

	const isIframe = !!Number(query.get('iframed'));
	const interactive = !query.has('path') && !query.has('code');
	const script = query.get('path');
	const code = query.get('code');

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
				<h1>php-cli-wasm preview</h1>
			</div>
		</div>
	</div>);

	const statusBar = (<div className = "row status">
		<div className = "row start wide toolbar" data-status>{statusMessage}</div>
		<div className = "row start toolbar" data-status>{exitCode}</div>
	</div>);

	return (<div className = "dbg-preview margined">
		<div className='bevel column'>
			{topBar}
			<div className='inset frame'>
				<Terminal
					setStatusMessage = {setStatusMessage}
					setExitCode = {setExitCode}
					interactive = {interactive}
					script = {script}
					code = {code}
					sharedLibs = {[
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
						yaml,
					]}
					files = {[
						{ parent: '/preload/test_www/', name: 'hello-world.php', url: './scripts/hello-world.php' },
						{ parent: '/preload/test_www/', name: 'phpinfo.php', url: './scripts/phpinfo.php' },
						{ parent: '/preload/', name: 'list-extensions.php', url: './scripts/list-extensions.php' },
					]}
				/>
			</div>
			{statusBar}
		</div>
	</div>)
}
