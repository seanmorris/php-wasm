import './Common.css';
import './SelectFramework.css';
import cakePhpIcon from './cakephp-icon.svg';
import drupalIcon from './drupal-icon.svg';
import codeIgniterIcon from './codeigniter-icon.svg';
import laravelIcon from './laravel-icon.svg';
import laminasIcon from './laminas-icon.svg';
import { useEffect, useMemo, useState } from 'react';
import Header from './Header';
import { sendMessageFor } from 'php-cgi-wasm/msg-bus';

import reactIcon from './react-icon.svg';
import floppyIcon from './icons/floppy-icon-32.png';
import nukeIcon from './icons/nuke-icon-32.png';
import cabinetIcon from './icons/file-cabinet-icon-32.png';
import { Backup, Clear, Restore } from './Filesystem';
import DoWithFile from './DoWithFile';
import ErrorDialog from './ErrorDialog';
import Confirm from './Confirm';

// const sendMessage = sendMessageFor(`${window.location.origin}${process.env.PUBLIC_URL}/cgi-worker.mjs`);
const sendMessage = sendMessageFor(navigator.serviceWorker.controller)

function SelectFramework() {

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [cakeInstalled, setCakeInstalled] = useState(false);
	const [codeigniterInstalled, setCodeigniterInstalled] = useState(false);
	const [drupalInstalled, setDrupalInstalled] = useState(false);
	const [laravelInstalled, setLaravelInstalled] = useState(false);
	const [laminasInstalled, setLaminasInstalled] = useState(false);
	const [overlay, setOverlay] = useState(null);
	const [isIframe, setIsIframe] = useState(!!Number(query.get('iframed')));

	const refreshAll = () => {
		sendMessage('analyzePath', ['/persist/cakephp-5']).then(about => setCakeInstalled(about.exists));
		sendMessage('analyzePath', ['/persist/codeigniter-4']).then(about => setCodeigniterInstalled(about.exists));
		sendMessage('analyzePath', ['/persist/drupal-7.95']).then(about => setDrupalInstalled(about.exists));
		sendMessage('analyzePath', ['/persist/laravel-11']).then(about => setLaravelInstalled(about.exists));
		sendMessage('analyzePath', ['/persist/laminas-3']).then(about => setLaminasInstalled(about.exists));
	};

	useEffect(() => refreshAll(), []);

	const onComplete = event => {
		switch(event.detail)
		{
			case 'cakephp-5':
				sendMessage('analyzePath', ['/persist/cakephp-5']).then(about => setCakeInstalled(about.exists));
				break;

			case 'codeigniter-4':
				sendMessage('analyzePath', ['/persist/codeigniter-4']).then(about => setCodeigniterInstalled(about.exists));
				break;

			case 'drupal-7':
				sendMessage('analyzePath', ['/persist/drupal-7.95']).then(about => setDrupalInstalled(about.exists));
				break;

			case 'laminas-3':
				sendMessage('analyzePath', ['/persist/laminas-3']).then(about => setLaminasInstalled(about.exists));
				break;

			case 'laravel-11':
				sendMessage('analyzePath', ['/persist/laravel-11']).then(about => setLaravelInstalled(about.exists));
				break;

			default:
			break;

		}
	}

	useEffect(() => {
		window.addEventListener('install-complete', onComplete);
		return () => {
			window.removeEventListener('install-complete', onComplete);
		}
	}, []);

	const backupSite = () => setOverlay(<Backup
		onComplete = { () => setOverlay(null) }
		onError = { (error) => setOverlay(<ErrorDialog message = {JSON.stringify(error)} onConfirm = { () => setOverlay(null) } />)}
	/>);

	const restoreSite = () => setOverlay(<DoWithFile
		onConfirm = { fileInput => setOverlay(<Restore
			fileInput = {fileInput}
			onComplete = { () => { setOverlay(null); refreshAll(); } }
			onError = { (error) => setOverlay(<ErrorDialog message = {JSON.stringify(error)} onConfirm = { () => setOverlay(null) } />)}
		/>) }
		onCancel = { () => setOverlay(null) }
		message = {(
			<span>Select a zip file to restore from.</span>
		)}
	/>);

	const clearFilesystem = () => setOverlay(<Confirm
		onConfirm = { () => setOverlay(<Clear onComplete = { () => {
			setCakeInstalled(false);
			setCodeigniterInstalled(false);
			setDrupalInstalled(false);
			setLaravelInstalled(false);
			setLaminasInstalled(false);
			setOverlay(null)
		} } />) }
		onCancel = { () => setOverlay(null) }
		message = {(
			<span>Are you sure you want to clear the filesystem? <b>Reminder:</b> This cannot be undone, you should take a backup first.</span>
		)}
	/>);

	return (
		<div className = "select-framework" data-iframed = {isIframe ? 1 : 0}>
			<div className='framework-menu bevel'>
				{isIframe || <Header />}
				<div className='frameworks'>
					<h2>Select a Framework:</h2>
					<div className='inset row icons'>
						<div className='column center'>
							<a onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=cakephp-5')}>
								<img src = {cakePhpIcon} alt = "cakephp 5" />
							</a>
							{cakeInstalled && (<span className = "contents">
								<button onClick = { () => window.open('/php-wasm/cgi-bin/cakephp-5')}>Open Demo</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/code-editor.html?path=/persist/cakephp-5/README.md')}>IDE</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=cakephp-5&overwrite=true')}>Reset</button>
							</span>)}
							{cakeInstalled || (<span className = "contents">
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=cakephp-5')}>Start</button>
							</span>)}
						</div>
						<div className='column center'>
							<a onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=codeigniter-4')}>
								<img src = {codeIgniterIcon} alt = "codeigniter 4" />
							</a>
							{codeigniterInstalled && (<span className = "contents">
								<button onClick = { () => window.open('/php-wasm/cgi-bin/codeigniter-4')}>Open Demo</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/code-editor.html?path=/persist/codeigniter-4/README.md')}>IDE</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=codeigniter-4&overwrite=true')}>Reset</button>
							</span>)}
							{codeigniterInstalled || (<span className = "contents">
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=codeigniter-4')}>Start</button>
							</span>)}
						</div>
						<div className='column center'>
							<a onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=drupal-7')}>
								<img src = {drupalIcon} alt = "drupal 7" /> {drupalInstalled}
							</a>
							{drupalInstalled && (<span className = "contents">
								<button onClick = { () => window.open('/php-wasm/cgi-bin/drupal')}>Open Demo</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/code-editor.html?path=/persist/drupal-7.95/README.txt')}>IDE</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=drupal-7&overwrite=true')}>Reset</button>
							</span>)}
							{drupalInstalled || (<span className = "contents">
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=drupal-7')}>Start</button>
							</span>)}
						</div>
						<div className='column center'>
							<a onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=laravel-11')}>
								<img src = {laravelIcon} alt = "laravel 11" />
							</a>
							{laravelInstalled && (<span className = "contents">
								<button onClick = { () => window.open('/php-wasm/cgi-bin/laravel-11')}>Open Demo</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/code-editor.html?path=/persist/laravel-11/README.md')}>IDE</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=laravel-11&overwrite=true')}>Reset</button>
							</span>)}
							{laravelInstalled || (<span className = "contents">
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=laravel-11')}>Start</button>
							</span>)}
						</div>
						<div className='column center'>
							<a onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=laminas-3')} >
								<img src = {laminasIcon} alt = "laminas 3" />
							</a>
							{laminasInstalled && (<span className = "contents">
								<button onClick = { () => window.open('/php-wasm/cgi-bin/laminas-3')}>Open Demo</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/code-editor.html?path=/persist/laminas-3/README.md')}>IDE</button>
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=laminas-3&overwrite=true')}>Reset</button>
							</span>)}
							{laminasInstalled || (<span className = "contents">
								<button onClick = { () => window.open(process.env.PUBLIC_URL + '/install-demo.html?framework=laminas-3')}>Start</button>
							</span>)}
						</div>
					</div>
					{isIframe || <>
						<h2>Filesystem Operations:</h2>
						<div className = "inset button-bar row">
							<button onClick = {backupSite}>
								<img alt = "Backup" src = {cabinetIcon} className = "icon" />
								Backup
							</button>
							<button onClick = {restoreSite}>
								<img alt = "Restore" src = {floppyIcon} className = "icon" />
								Restore
								</button>
							<button onClick = {clearFilesystem}>
								<img alt = "Clear" src = {nukeIcon} className = "icon" />
								Clear
							</button>
						</div>
						<div className = "inset right demo-bar">
							<span>Demo powered by React</span> <img src = {reactIcon} className='small-icon'/>
						</div>
					</>}
					{isIframe && <div className = "inset center">
						<h2 style = {{marginBottom: "0"}}><a
							style = {{padding: "1rem"}}
							href = "#"
							onClick = {() => window.open(process.env.PUBLIC_URL + '/')}>
								Open Full Demo
						</a></h2>
					</div>}
				</div>
			</div>
			<div className = "overlay">{overlay}</div>
		</div>
	);
}

export default SelectFramework;
