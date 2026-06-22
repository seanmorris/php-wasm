/**
 * Framework chooser page plus filesystem maintenance controls for the CGI demos.
 */
import '../styles/Common.css';
import '../styles/SelectFramework.css';
import cakePhpIcon from '../assets/frameworks/cakephp-icon.svg';
import drupalIcon from '../assets/frameworks/drupal-icon.svg';
import codeIgniterIcon from '../assets/frameworks/codeigniter-icon.svg';
import laravelIcon from '../assets/frameworks/laravel-icon.svg';
import laminasIcon from '../assets/frameworks/laminas-icon.svg';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import Header from '../components/Header';
import { basePath } from '../lib/runtimePaths';
import { getPhpBus } from '../lib/phpBus';
import { popupTarget, resolvePopupHref, resolvePopupRequest } from '../lib/popupNavigation';

import reactIcon from '../assets/frameworks/react-icon.svg';
import floppyIcon from '../assets/icons/floppy-icon-32.png';
import nukeIcon from '../assets/icons/nuke-icon-32.png';
import cabinetIcon from '../assets/icons/file-cabinet-icon-32.png';
import { Backup, Clear, Restore } from '../components/Filesystem';
import DoWithFile from '../components/DoWithFile';
import ErrorDialog from '../components/ErrorDialog';
import Confirm from '../components/Confirm';

/**
 * Anchor wrapper that preserves popup opener semantics for demo launches.
 */
const PopupLink = ({children, className = '', path, ...props}) => (
	<a
		{...props}
		className = {['popup-link', className].filter(Boolean).join(' ')}
		href = {resolvePopupHref(path)}
		rel = "opener"
		target = {popupTarget}
	>
		{children}
	</a>
);

/**
 * Form-backed popup launcher that preserves query parameters in a new window.
 */
const PopupButton = ({children, path}) => (
	<form
		action = {resolvePopupRequest(path).action}
		className = "popup-form"
		method = "get"
		target = {popupTarget}
	>
		{resolvePopupRequest(path).params.map(([name, value], index) => (
			<input
				key = {`${name}:${value}:${index}`}
				name = {name}
				type = "hidden"
				value = {value}
			/>
		))}
		<button type = "submit">{children}</button>
	</form>
);

/**
 * Renders the framework picker and tracks which demo installs are present.
 */
function SelectFramework()
{

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [cakeInstalled, setCakeInstalled] = useState(false);
	const [codeigniterInstalled, setCodeigniterInstalled] = useState(false);
	const [drupalInstalled, setDrupalInstalled] = useState(false);
	const [laravelInstalled, setLaravelInstalled] = useState(false);
	const [laminasInstalled, setLaminasInstalled] = useState(false);
	const [overlay, setOverlay] = useState(null);
	const [isIframe] = useState(!!Number(query.get('iframed')));

	const refreshAll = useCallback(() => {
		void (async() => {
			const bus = await getPhpBus();
			const [
				cakePath
				, codeigniterPath
				, drupalPath
				, laravelPath
				, laminasPath
			] = await Promise.all([
				bus.analyzePath('/persist/cakephp-5')
				, bus.analyzePath('/persist/codeigniter-4')
				, bus.analyzePath('/persist/drupal-7.95')
				, bus.analyzePath('/persist/laravel-11')
				, bus.analyzePath('/persist/laminas-3')
			]);

			setCakeInstalled(cakePath.exists);
			setCodeigniterInstalled(codeigniterPath.exists);
			setDrupalInstalled(drupalPath.exists);
			setLaravelInstalled(laravelPath.exists);
			setLaminasInstalled(laminasPath.exists);
		})();
	}, []);

	useEffect(() => {
		refreshAll();
	}, [refreshAll]);

	const onComplete = useEffectEvent(event => {
		switch(event.detail)
		{
			case 'cakephp-5':
			case 'codeigniter-4':
			case 'drupal-7':
			case 'laminas-3':
			case 'laravel-11':
				refreshAll();
				break;

			default:
				break;

		}
	});

	useEffect(() => {
		const installCompleteListener = event => {
			onComplete(event);
		};

		window.addEventListener('install-complete', installCompleteListener);
		return () => {
			window.removeEventListener('install-complete', installCompleteListener);
		};
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
			setOverlay(null);
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
							<PopupLink path = "install-demo.html?framework=cakephp-5">
								<img src = {cakePhpIcon} alt = "cakephp 5" />
							</PopupLink>
							{cakeInstalled && (<span className = "contents">
								<PopupButton path = {basePath('cgi-bin/cakephp-5')}>Open Demo</PopupButton>
								<PopupButton path = "code-editor.html?path=/persist/cakephp-5/webroot/index.php">IDE</PopupButton>
								<PopupButton path = "install-demo.html?framework=cakephp-5&overwrite=true">Reset</PopupButton>
							</span>)}
							{cakeInstalled || (<span className = "contents">
								<PopupButton path = "install-demo.html?framework=cakephp-5">Start</PopupButton>
							</span>)}
						</div>
						<div className='column center'>
							<PopupLink path = "install-demo.html?framework=codeigniter-4">
								<img src = {codeIgniterIcon} alt = "codeigniter 4" />
							</PopupLink>
							{codeigniterInstalled && (<span className = "contents">
								<PopupButton path = {basePath('cgi-bin/codeigniter-4')}>Open Demo</PopupButton>
								<PopupButton path = "code-editor.html?path=/persist/codeigniter-4/public/index.php">IDE</PopupButton>
								<PopupButton path = "install-demo.html?framework=codeigniter-4&overwrite=true">Reset</PopupButton>
							</span>)}
							{codeigniterInstalled || (<span className = "contents">
								<PopupButton path = "install-demo.html?framework=codeigniter-4">Start</PopupButton>
							</span>)}
						</div>
						<div className='column center'>
							<PopupLink path = "install-demo.html?framework=drupal-7">
								<img src = {drupalIcon} alt = "drupal 7" /> {drupalInstalled}
							</PopupLink>
							{drupalInstalled && (<span className = "contents">
								<PopupButton path = {basePath('cgi-bin/drupal')}>Open Demo</PopupButton>
								<PopupButton path = "code-editor.html?path=/persist/drupal-7.95/index.php">IDE</PopupButton>
								<PopupButton path = "install-demo.html?framework=drupal-7&overwrite=true">Reset</PopupButton>
							</span>)}
							{drupalInstalled || (<span className = "contents">
								<PopupButton path = "install-demo.html?framework=drupal-7">Start</PopupButton>
							</span>)}
						</div>
						<div className='column center'>
							<PopupLink path = "install-demo.html?framework=laravel-11">
								<img src = {laravelIcon} alt = "laravel 11" />
							</PopupLink>
							{laravelInstalled && (<span className = "contents">
								<PopupButton path = {basePath('cgi-bin/laravel-11')}>Open Demo</PopupButton>
								<PopupButton path = "code-editor.html?path=/persist/laravel-11/public/index.php">IDE</PopupButton>
								<PopupButton path = "install-demo.html?framework=laravel-11&overwrite=true">Reset</PopupButton>
							</span>)}
							{laravelInstalled || (<span className = "contents">
								<PopupButton path = "install-demo.html?framework=laravel-11">Start</PopupButton>
							</span>)}
						</div>
						<div className='column center'>
							<PopupLink path = "install-demo.html?framework=laminas-3">
								<img src = {laminasIcon} alt = "laminas 3" />
							</PopupLink>
							{laminasInstalled && (<span className = "contents">
								<PopupButton path = {basePath('cgi-bin/laminas-3')}>Open Demo</PopupButton>
								<PopupButton path = "code-editor.html?path=/persist/laminas-3/public/index.php">IDE</PopupButton>
								<PopupButton path = "install-demo.html?framework=laminas-3&overwrite=true">Reset</PopupButton>
							</span>)}
							{laminasInstalled || (<span className = "contents">
								<PopupButton path = "install-demo.html?framework=laminas-3">Start</PopupButton>
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
							<span>Demo powered by React</span> <img src = {reactIcon} className='small-icon' alt = "React logo" />
						</div>
					</>}
					{isIframe && <div className = "inset center">
						<h2 style = {{marginBottom: "0"}}><PopupLink
							style = {{padding: "1rem"}}
							path = ""
						>
							Open Full Demo
						</PopupLink></h2>
					</div>}
				</div>
			</div>
			<div className = "overlay">{overlay}</div>
		</div>
	);
}

export default SelectFramework;
