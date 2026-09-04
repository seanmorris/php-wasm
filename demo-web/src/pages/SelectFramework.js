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
import wordpressIcon from '../assets/frameworks/wordpress-icon.svg';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import Header from '../components/Header';
import { basePath } from '../lib/runtimePaths';
import { getPhpBus } from '../lib/phpBus';
import { popupTarget, resolvePopupHref, resolvePopupRequest } from '../lib/popupNavigation';

import reactIcon from '../assets/frameworks/react-icon.svg';
import alertIcon from '../assets/icons/alert-16.png';
import floppyIcon from '../assets/icons/floppy-icon-32.png';
import nukeIcon from '../assets/icons/nuke-icon-32.png';
import cabinetIcon from '../assets/icons/file-cabinet-icon-32.png';
import DoWithFile from '../components/DoWithFile';
import ErrorDialog from '../components/ErrorDialog';
import Confirm from '../components/Confirm';
import {
	drupalPgsqlDatabase
	, drupalPgsqlReadyQuery
	, isDrupalPgsqlReady
} from '../lib/drupalDatabase';

const drupalDatabaseVariants = {
	sqlite: {
		installPath: '/persist/drupal-11.4.5/web'
		, editorPath: '/persist/drupal-11.4.5/web/index.php'
	}
	, pgsql: {
		installPath: '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		, editorPath: '/persist/drupal-11.4.5-pgsql/web/index.php'
	}
};

const drupalInstallUrlFor = database => (
	'install-demo.html?framework=drupal-11'
	+ `&database=${database}`
);

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
		rel = "opener"
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
 * Prompts for the Drupal database before opening the installer popup.
 */
const DrupalDatabaseDialog = ({defaultDatabase, onCancel, onSelect}) => {
	const [database, setDatabase] = useState(defaultDatabase);
	const installRequest = resolvePopupRequest('install-demo.html?framework=drupal-11');

	const onSubmit = () => {
		onSelect(database);
		window.setTimeout(onCancel, 0);
	};

	return (
		<div
			aria-labelledby = "drupal-database-dialog-title"
			aria-modal = "true"
			className = "Confirm"
			role = "dialog"
		>
			<form
				action = {installRequest.action}
				className = "dialog bevel column drupal-database-dialog"
				method = "get"
				onSubmit = {onSubmit}
				rel = "opener"
				target = {popupTarget}
			>
				<h2 id = "drupal-database-dialog-title">Choose a Drupal database</h2>
				{installRequest.params.map(([name, value], index) => (
					<input
						key = {`${name}:${value}:${index}`}
						name = {name}
						type = "hidden"
						value = {value}
					/>
				))}
				<div className = "inset padded column drupal-database-options">
					<label className = "drupal-database-option">
						<span>
							<input
								checked = {database === 'sqlite'}
								name = "database"
								onChange = {() => setDatabase('sqlite')}
								type = "radio"
								value = "sqlite"
							/>
							SQLite
						</span>
					</label>
					<label className = "drupal-database-option">
						<span>
							<input
								checked = {database === 'pgsql'}
								name = "database"
								onChange = {() => setDatabase('pgsql')}
								type = "radio"
								value = "pgsql"
							/>
							PostgreSQL
						</span>
						<span className = "drupal-database-warning">
							<img alt = "" aria-hidden = "true" src = {alertIcon} />
							Slow
						</span>
					</label>
				</div>
				<div className = "right">
					<button className = "padded" type = "submit">Start</button>
					<button className = "padded" onClick = {onCancel} type = "button">Cancel</button>
				</div>
			</form>
		</div>
	);
};

/**
 * Renders the framework picker and tracks which demo installs are present.
 */
function SelectFramework()
{

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const [cakeInstalled, setCakeInstalled] = useState(false);
	const [codeigniterInstalled, setCodeigniterInstalled] = useState(false);
	const [drupalInstalled, setDrupalInstalled] = useState({
		sqlite: false
		, pgsql: false
	});
	const [drupalDatabase, setDrupalDatabase] = useState('sqlite');
	const [laravelInstalled, setLaravelInstalled] = useState(false);
	const [laminasInstalled, setLaminasInstalled] = useState(false);
	const [wordpressInstalled, setWordpressInstalled] = useState(false);
	const [overlay, setOverlay] = useState(null);
	const [isIframe] = useState(!!Number(query.get('iframed')));
	const serviceWorkerDisabled = query.has('no-service-worker');

	const refreshAll = useCallback(() => {
		if(serviceWorkerDisabled)
		{
			return;
		}

		void (async() => {
			const bus = await getPhpBus();
			const [
				cakePath
				, codeigniterPath
				, drupalSqlitePath
				, drupalPgsqlPath
				, laravelPath
				, laminasPath
				, wordpressPath
			] = await Promise.all([
				bus.analyzePath('/persist/cakephp-5')
				, bus.analyzePath('/persist/codeigniter-4')
				, bus.analyzePath(drupalDatabaseVariants.sqlite.installPath)
				, bus.analyzePath(drupalDatabaseVariants.pgsql.installPath)
				, bus.analyzePath('/persist/laravel-11')
				, bus.analyzePath('/persist/laminas-3')
				, bus.analyzePath('/persist/wordpress-7.1')
			]);

			setCakeInstalled(cakePath.exists);
			setCodeigniterInstalled(codeigniterPath.exists);
			let drupalPgsqlInstalled = false;

			if(drupalPgsqlPath.exists)
			{
				try
				{
					drupalPgsqlInstalled = isDrupalPgsqlReady(
						await bus.runSql(drupalPgsqlDatabase, drupalPgsqlReadyQuery)
					);
				}
				catch(error)
				{
					console.warn('Could not validate the Drupal PostgreSQL demo.', error);
				}
			}

			const nextDrupalInstalled = {
				sqlite: drupalSqlitePath.exists
				, pgsql: drupalPgsqlInstalled
			};

			setDrupalInstalled(nextDrupalInstalled);
			setDrupalDatabase(current => (
				nextDrupalInstalled[current]
				|| (!nextDrupalInstalled.sqlite && !nextDrupalInstalled.pgsql)
					? current
					: nextDrupalInstalled.pgsql ? 'pgsql' : 'sqlite'
			));
			setLaravelInstalled(laravelPath.exists);
			setLaminasInstalled(laminasPath.exists);
			setWordpressInstalled(wordpressPath.exists);
		})();
	}, [serviceWorkerDisabled]);

	useEffect(() => {
		refreshAll();
	}, [refreshAll]);

	const onComplete = useEffectEvent(event => {
		switch(event.detail)
		{
			case 'cakephp-5':
			case 'codeigniter-4':
			case 'drupal-11':
			case 'laminas-3':
			case 'laravel-11':
			case 'wordpress-7.1':
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

	const backupSite = async () => {
		const { Backup } = await import('../components/Filesystem');

		setOverlay(<Backup
			onComplete = { () => setOverlay(null) }
			onError = { (error) => setOverlay(<ErrorDialog message = {JSON.stringify(error)} onConfirm = { () => setOverlay(null) } />)}
		/>);
	};

	const restoreSite = () => setOverlay(<DoWithFile
		onConfirm = { async fileInput => {
			const { Restore } = await import('../components/Filesystem');

			setOverlay(<Restore
				fileInput = {fileInput}
				onComplete = { () => { setOverlay(null); refreshAll(); } }
				onError = { (error) => setOverlay(<ErrorDialog message = {JSON.stringify(error)} onConfirm = { () => setOverlay(null) } />)}
			/>);
		} }
		onCancel = { () => setOverlay(null) }
		message = {(
			<span>Select a zip file to restore from.</span>
		)}
	/>);

	const clearFilesystem = () => setOverlay(<Confirm
		onConfirm = { async () => {
			const { Clear } = await import('../components/Filesystem');

			setOverlay(<Clear onComplete = { () => {
				setCakeInstalled(false);
				setCodeigniterInstalled(false);
				setDrupalInstalled({sqlite: false, pgsql: false});
				setLaravelInstalled(false);
				setLaminasInstalled(false);
				setWordpressInstalled(false);
				setOverlay(null);
			} } />);
		} }
		onCancel = { () => setOverlay(null) }
		message = {(
			<span>Are you sure you want to clear the filesystem? <b>Reminder:</b> This cannot be undone, you should take a backup first.</span>
		)}
	/>);

	const selectedDrupal = drupalDatabaseVariants[drupalDatabase];
	const selectedDrupalInstalled = drupalInstalled[drupalDatabase];
	const drupalInstallUrl = drupalInstallUrlFor(drupalDatabase);
	const chooseDrupalDatabase = () => setOverlay(<DrupalDatabaseDialog
		defaultDatabase = {drupalDatabase}
		onCancel = {() => setOverlay(null)}
		onSelect = {setDrupalDatabase}
	/>);

	return (
		<div className = "select-framework viewport-page" data-iframed = {isIframe ? 1 : 0}>
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
							{selectedDrupalInstalled
								? <PopupLink path = {drupalInstallUrl}>
									<img src = {drupalIcon} alt = "drupal 11" />
								</PopupLink>
								: <button
									className = "popup-link drupal-start-icon"
									onClick = {chooseDrupalDatabase}
									type = "button"
								>
									<img src = {drupalIcon} alt = "drupal 11" />
								</button>}
							{selectedDrupalInstalled && (<span className = "contents">
								<PopupButton path = {drupalInstallUrl}>Open Demo</PopupButton>
								<PopupButton path = {`code-editor.html?path=${selectedDrupal.editorPath}`}>IDE</PopupButton>
								<PopupButton path = {`${drupalInstallUrl}&overwrite=true`}>Reset</PopupButton>
							</span>)}
							{selectedDrupalInstalled || (<span className = "contents">
								<button onClick = {chooseDrupalDatabase} type = "button">Start</button>
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
						<div className='column center'>
							<PopupLink path = "install-demo.html?framework=wordpress-7.1">
								<img src = {wordpressIcon} alt = "wordpress 7.1" />
							</PopupLink>
							{wordpressInstalled && (<span className = "contents">
								<PopupButton path = {basePath('cgi-bin/wordpress')}>Open Demo</PopupButton>
								<PopupButton path = "code-editor.html?path=/persist/wordpress-7.1/index.php">IDE</PopupButton>
								<PopupButton path = "install-demo.html?framework=wordpress-7.1&overwrite=true">Reset</PopupButton>
							</span>)}
							{wordpressInstalled || (<span className = "contents">
								<PopupButton path = "install-demo.html?framework=wordpress-7.1">Start</PopupButton>
							</span>)}
						</div>
					</div>
					{(!isIframe && !serviceWorkerDisabled) && <>
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
