/**
 * Lightweight editor with explicit saves, checked file operations and PHP debugging.
 */
import '../styles/Common.css';
import '../styles/Editor.css';
import {useCallback, useEffect, useRef, useState} from 'react';
import ace, {Range} from 'ace-builds';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-css';
import 'ace-builds/src-noconflict/mode-html';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-markdown';
import 'ace-builds/src-noconflict/mode-php';
import 'ace-builds/src-noconflict/mode-text';
import 'ace-builds/src-noconflict/mode-xml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-monokai';
import Header from '../components/Header';
import Debugger from '../components/Debugger';
import EditorFolder from '../components/EditorFolder';
import EditorDialog from '../components/EditorDialog';
import EditorQuickOpen from '../components/EditorQuickOpen';
import {useEditorWorkspace} from '../lib/useEditorWorkspace';
import {useEditorRecovery} from '../lib/useEditorRecovery';
import {editorFilesystem as filesystem} from '../lib/editorFilesystem';
import {editorPath, isPersistentPath, parentPath, withinPath} from '../lib/editorPaths';
import {basePath} from '../lib/runtimePaths';
import {encodeEditorFile} from '../lib/EditorDocuments';
import {droppedEntries, pickerEntries, importEntries, exportEntries} from '../lib/editorTransfers';
import saveIcon from '../assets/nuvola/3floppy_unmount.png';
import vsCodeIcon from '../assets/icons/vscode-16.png';

const modes = {
	php: 'php'
	, phtml: 'php'
	, module: 'php'
	, inc: 'php'
	, js: 'javascript'
	, mjs: 'javascript'
	, json: 'json'
	, html: 'html'
	, css: 'css'
	, md: 'markdown'
	, xml: 'xml'
	, yml: 'yaml'
	, yaml: 'yaml'
};
const modeFor = path => 'ace/mode/' + (modes[path?.split('.').pop()?.toLowerCase()] || 'text');
const createSession = (text, path) => {
	const session = ace.createEditSession(text);
	session.setUseWorker?.(false);
	session.setMode(modeFor(path));
	return session;
};
const cancel = {action: 'cancel', label: 'Cancel'};

/** Download bytes without rewriting binary contents or leaving object URLs alive. */
const download = (bytes, name, type = 'application/octet-stream') => {
	const url = URL.createObjectURL(new Blob([bytes], {type}));
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Render the workspace while keeping Ace and debugger references out of file ownership. */
export default function Editor()
{
	const editor = useRef(null);
	const emptySession = useRef(null);
	const openDbg = useRef(null);
	const breakpoints = useRef(new Map());
	const currentBreak = useRef({});
	const marker = useRef(null);
	const started = useRef(false);
	const initialPath = useRef(new URLSearchParams(window.location.search).get('path'));
	const uploadInput = useRef(null);
	const folderInput = useRef(null);
	const zipInput = useRef(null);
	const explorerMenu = useRef(null);
	const uploadDestination = useRef('/persist');
	const [ready, setReady] = useState(false);
	const [initialized, setInitialized] = useState(false);
	const [showLeft, setShowLeft] = useState(true);
	const [debuggerActive, setDebuggerActive] = useState(false);
	const [debuggerStartFile, setDebuggerStartFile] = useState(null);
	const [debuggerCommands, setDebuggerCommands] = useState([]);
	const [isExecuting, setIsExecuting] = useState(false);
	const [phpVersion, setPhpVersion] = useState('8.3');
	const [filter, setFilter] = useState('');
	const [sidebarWidth, setSidebarWidth] = useState(288);
	const [preview, setPreview] = useState(null);
	const [storage, setStorage] = useState(null);
	const [showQuickOpen, setShowQuickOpen] = useState(false);
	const workspace = useEditorWorkspace({
		createSession
		, onMove(from, to) {
			const next = new Map();
			for(const [key, id] of breakpoints.current)
			{
				const separator = key.lastIndexOf(':');
				const path = key.slice(0, separator);
				next.set((withinPath(path, from) ? to + path.slice(from.length) : path) + key.slice(separator), id);
			}
			breakpoints.current = next;
			if(debuggerActive)
			{
				setDebuggerActive(false);
				setIsExecuting(false);
			}
		}
		, onDelete(path) {
			for(const key of breakpoints.current.keys()) if(withinPath(key.slice(0, key.lastIndexOf(':')), path)) breakpoints.current.delete(key);
			if(debuggerActive)
			{
				setDebuggerActive(false);
				setIsExecuting(false);
			}
		}
	});
	const w = workspace;
	const recovery = useEditorRecovery(w);
	const workspaceRef = useRef(w);
	workspaceRef.current = w;
	const doc = w.model.active;
	const documents = [...w.model.documents.values()];
	const blocked = !!w.busy || debuggerActive;
	useEffect(() => {
		const dismiss = event => {
			const menu = explorerMenu.current;
			if(menu?.open && !menu.contains(event.target)) menu.open = false;
		};
		document.addEventListener('pointerdown', dismiss);
		return () => document.removeEventListener('pointerdown', dismiss);
	}, []);

	useEffect(() => {
		if(!ready || !editor.current?.container || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => editor.current?.resize());
		observer.observe(editor.current.container);
		return () => observer.disconnect();
	}, [ready]);

	const handleEditorLoad = useCallback(instance => {
		editor.current = instance;
		emptySession.current = createSession('', null);
		instance.setSession(emptySession.current);
		instance.setReadOnly(true);
		instance.textInput?.getElement().setAttribute('aria-label', 'File contents');
		setReady(true);
	}, []);

	useEffect(() => {
		if(!ready) return;
		const instance = editor.current;
		const session = doc?.loaded && !doc.loading ? doc.session : emptySession.current;
		if(instance.getSession() !== session)
		{
			if(marker.current)
			{
				marker.current.session.removeMarker(marker.current.id);
				marker.current = null;
			}
			instance.setSession(session);
		}
		session?.setMode?.(modeFor(doc?.path));
		instance.setReadOnly(debuggerActive || !doc?.loaded || doc.binary || doc.writable === false || !!doc.loading);
		const query = new URLSearchParams(window.location.search);
		if(doc?.path) query.set('path', doc.path); else query.delete('path');
		window.history.replaceState({}, '', window.location.pathname + (query.size ? '?' + query : ''));
	}, [w.version, ready, debuggerActive, doc]);

	useEffect(() => {
		if(!ready || !recovery.ready || started.current) return;
		started.current = true;
		const path = initialPath.current;
		if(path && path !== '/')
		{
			void workspaceRef.current.openFile(path).finally(() => setInitialized(true));
		}
		else setInitialized(true);
	}, [ready, recovery.ready]);

	useEffect(() => {
		if(!initialized || w.model.documents.size) return;
		// Wait for recovery and the initial path before supplying an editable blank.
		// It can be saved immediately, but an untouched visit has no edits to discard.
		const untitled = w.model.create();
		untitled.dirty = false;
		w.model.select(untitled);
	}, [initialized, w.model, w.version]);

	const gotoFile = useCallback(async (path, line) => {
		if(typeof path !== 'string' || !path.startsWith('/')) return;
		const opened = await workspaceRef.current.openFile(path);
		if(!opened || workspaceRef.current.model.active !== opened || !editor.current) return;
		editor.current.setSession(opened.session);
		if(marker.current) marker.current.session.removeMarker(marker.current.id);
		if(!Number.isInteger(line) || line < 1) return;
		const id = opened.session.addMarker(new Range(line - 1, 0, line - 1, Infinity), 'active_breakpoint', 'fullLine', true);
		marker.current = {session: opened.session, id};
		editor.current.scrollToLine(line - 1, true, true, () => {});
	}, []);

	useEffect(() => {
		if(!ready) return;
		const instance = editor.current;
		const onGutter = async event => {
			const current = workspaceRef.current.model.active;
			const cell = event.domEvent.target?.closest?.('.ace_gutter-cell');
			if(!current?.path || !cell || event.clientX > cell.getBoundingClientRect().left + 28) return;
			const line = event.getDocumentPosition().row;
			const key = current.path + ':' + (line + 1);
			try
			{
				if(breakpoints.current.has(key))
				{
					if(openDbg.current) await openDbg.current.clearBreakpoint(breakpoints.current.get(key));
					current.session.clearBreakpoint(line);
					breakpoints.current.delete(key);
				}
				else
				{
					const id = openDbg.current ? await openDbg.current.setBreakpoint(current.path, line + 1) : breakpoints.current.size;
					current.session.setBreakpoint(line);
					breakpoints.current.set(key, id);
				}
				instance.renderer?.updateBreakpoints();
			}
			catch(failure)
			{
				workspaceRef.current.setError({label: 'Breakpoint', message: failure.message});
			}
			event.domEvent.preventDefault();
			event.stop?.();
		};
		instance.on('guttermousedown', onGutter);
		return () => instance.off('guttermousedown', onGutter);
	}, [ready]);

	const save = () => w.perform('Save', () => w.saveDocument(w.model.active));
	const startDebugger = () => {
		if(debuggerActive)
		{
			setDebuggerActive(false);
			setIsExecuting(false);
			if(marker.current)
			{
				marker.current.session.removeMarker(marker.current.id);
				marker.current = null;
			}
			return;
		}
		void w.perform('Start debugger', async () => {
			if(!w.model.active) throw new Error('Open a PHP file first.');
			if(w.model.dirty || !w.model.active.path)
			{
				const choice = await w.ask({title: 'Save before debugging?', message: 'The debugger runs files from the filesystem. Save all changed files before starting.', choices: [{action: 'save', label: 'Save and start'}, cancel]});
				if(choice.action !== 'save') return false;
				if(!w.model.active.path && !await w.saveDocument(w.model.active)) return false;
				await w.saveAll();
			}
			if(!w.model.active.path) return false;
			setDebuggerStartFile(w.model.active.path);
			setDebuggerCommands([...breakpoints.current.keys()].map(key => 'b ' + key).concat('run'));
			setDebuggerActive(true);
			return true;
		});
	};
	const navigate = path => w.perform('Leave editor', async () => {
		if(!await w.guard()) return false;
		await recovery.flush();
		w.allowNavigationOnce();
		window.location.href = typeof path === 'function' ? path() : path;
		return true;
	});
	const openVsCode = () => {
		void navigate(() => {
			const path = w.model.active?.path;
			const query = new URLSearchParams(path ? {path} : {});
			return basePath('vscode.html') + (query.size ? '?' + query : '');
		});
	};
	const openByPath = () => w.perform('Open file', async () => {
		const path = await w.promptPath('Open file by path', doc?.path || w.directory + '/');
		if(!path) return false;
		return !!await w.openFile(path);
	});
	const quickOpen = () => setShowQuickOpen(true);

	useEffect(() => {
		const handler = event => {
			if(workspaceRef.current.dialog || showQuickOpen || event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
			const current = workspaceRef.current;
			if(current.busy || debuggerActive) return;
			const key = event.key.toLowerCase();
			if(key === 's')
			{
				event.preventDefault();
				void current.perform(event.shiftKey ? 'Save All' : 'Save', () => event.shiftKey ? current.saveAll() : current.saveDocument(current.model.active));
			}
			if(key === 'o')
			{
				event.preventDefault();
				void openByPath();
			}
			if(key === 'p')
			{
				event.preventDefault();
				quickOpen();
			}
			if(key === 'n')
			{
				event.preventDefault();
				current.newDocument();
			}
			if(key === 'w')
			{
				event.preventDefault();
				if(current.model.active) void current.closeDocuments([current.model.active]);
			}
			if(key === 't' && event.shiftKey)
			{
				event.preventDefault();
				if(current.model.closed[0]) void current.openFile(current.model.closed[0]);
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	useEffect(() => {
		const mime = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml'}[doc?.path?.split('.').pop()?.toLowerCase()];
		if(!doc?.bytes || !mime)
		{
			setPreview(null);
			return;
		}
		const url = URL.createObjectURL(new Blob([doc.bytes], {type: mime}));
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [doc?.path, doc?.bytes]);
	useEffect(() => {
		navigator.storage?.estimate?.().then(setStorage).catch(() => setStorage(null));
	}, [w.refresh]);

	const entryMenu = async entry => {
		if(blocked) return;
		const choice = await w.ask({title: entry.path
			, choices: [
				{action: 'rename', label: 'Rename', disabled: entry.protected}
				, {action: 'duplicate', label: 'Duplicate', disabled: entry.protected}
				, {action: 'copy', label: 'Copy', disabled: entry.protected}
				, {action: 'cut', label: 'Cut', disabled: entry.protected}
				, {action: 'move', label: 'Move…', disabled: entry.protected}
				, {action: 'delete', label: 'Delete…', disabled: entry.protected}
				, {action: 'download', label: entry.kind === 'directory' ? 'Export folder as ZIP' : 'Download file'}
				, cancel
			]
		});
		const current = workspaceRef.current;
		if(choice.action === 'rename') void current.rename(entry);
		if(choice.action === 'duplicate') void current.duplicate(entry);
		if(choice.action === 'copy') void current.copySelection(false);
		if(choice.action === 'cut') void current.copySelection(true);
		if(choice.action === 'move') void current.moveSelection();
		if(choice.action === 'delete') void current.removeSelected();
		if(choice.action === 'download')
		{
			if(entry.kind === 'directory') void exportFolder(entry.path);
			else void current.perform('Download file', async () => {
				const file = await filesystem.read(entry.path);
				download(file.bytes, entry.name);
				return true;
			});
		}
	};
	const upload = async (entries, destination) => {
		await w.perform('Import files', async () => importEntries(await entries, destination, {ask: w.ask, progress: w.setStatus}));
		await w.checkExternal();
	};
	const pickUpload = input => {
		uploadDestination.current = w.directory;
		input.current.click();
	};
	const picked = event => {
		const files = [...event.target.files];
		event.target.value = '';
		void upload(Promise.resolve().then(() => pickerEntries(files)), uploadDestination.current);
	};
	const importZip = event => {
		const file = event.target.files[0];
		event.target.value = '';
		if(!file) return;
		void w.perform('Import ZIP', async () => {
			let destination = uploadDestination.current;
			if(destination === '/') destination = await w.promptPath('Import ZIP into folder', '/persist');
			if(!destination) return false;
			if(destination === '/') throw new Error('Choose a folder below the filesystem root.');
			if(file.size > 64 * 1024 * 1024) throw new Error('ZIP input exceeds 64 MiB.');
			const {editorArchive} = await import('../lib/editorArchives');
			w.setStatus('Validating and decompressing ZIP…');
			const entries = await editorArchive('unpack', new Uint8Array(await file.arrayBuffer()));
			try
			{
				return await importEntries(entries, destination, {ask: w.ask, progress: w.setStatus});
			}
			finally
			{
				w.invalidate();
			}
		});
	};
	const exportFolder = path => w.perform('Export ZIP', async () => {
		const {editorArchive} = await import('../lib/editorArchives');
		const entries = await exportEntries(path, w.setStatus);
		w.setStatus('Compressing folder…');
		const bytes = await editorArchive('pack', entries);
		download(bytes, (path.split('/').pop() || 'filesystem') + '.zip', 'application/zip');
		return true;
	});
	const drop = (event, entry) => {
		event.preventDefault();
		event.stopPropagation();
		if(blocked) return;
		const raw = event.dataTransfer.getData('application/x-php-wasm-paths');
		if(!raw)
		{
			void upload(droppedEntries(event.dataTransfer), entry.kind === 'directory' ? entry.path : parentPath(entry.path));
			return;
		}
		void w.perform('Move dropped files', async () => {
			const paths = JSON.parse(raw).map(editorPath);
			const entries = await Promise.all(paths.filter(path => !paths.some(other => path !== other && withinPath(path, other))).map(path => filesystem.inspect(path)));
			return w.transfer(entries, entry.kind === 'directory' ? entry.path : parentPath(entry.path), true);
		});
	};
	const downloadCurrent = () => {
		if(!doc?.loaded) return;
		const bytes = doc.binary ? doc.bytes : encodeEditorFile(doc.session.getValue(), doc.bom);
		download(bytes, doc.name);
	};
	const treeKeys = event => {
		if(!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
		const rows = [...event.currentTarget.querySelectorAll('[role="treeitem"]')];
		const current = event.target.closest('[role="treeitem"]');
		const index = rows.indexOf(current);
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
		if(rows[next])
		{
			event.preventDefault();
			rows[next].focus();
		}
	};

	return <div className="editor viewport-page" data-show-left={showLeft} style={{'--editor-sidebar-width': sidebarWidth + 'px'}}>
		<div className="bevel" inert={w.dialog || showQuickOpen ? true : undefined} onClickCapture={event => {
			const link = event.target.closest('a[href]');
			if(link && w.model.dirty)
			{
				event.preventDefault();
				event.stopPropagation();
				void navigate(link.href);
			}
		}}>
			<Header />
			<div className="row toolbar inset tight editor-toolbar">
				<button title="Toggle explorer" aria-label="Toggle explorer" aria-expanded={showLeft} onClick={() => setShowLeft(value => !value)}>☰</button>
				<details className="editor-menu" onClick={event => {
					if(event.target.closest('button')) event.currentTarget.open = false;
				}}><summary>File</summary><div className="bevel">
						<button disabled={blocked} onClick={w.newDocument}>New untitled file</button>
						<button disabled={blocked} onClick={() => w.newEntry(false)}>New file in folder…</button>
						<button disabled={blocked} onClick={() => w.newEntry(true)}>New folder…</button>
						<button disabled={blocked} onClick={openByPath}>Open by path…</button>
						<button disabled={blocked || !doc || doc.binary || !doc.loaded} onClick={save}>Save</button>
						<button disabled={blocked || !doc || doc.binary || !doc.loaded} onClick={() => w.perform('Save As', () => w.saveDocument(doc, true))}>Save As…</button>
						<button disabled={blocked || !w.model.dirty} onClick={() => w.perform('Save All', w.saveAll)}>Save All</button>
						<button disabled={blocked || !doc?.path} onClick={() => w.revert(doc)}>Revert…</button>
						<button disabled={!doc?.loaded} onClick={downloadCurrent}>Download current file</button>
						<button disabled={blocked} onClick={() => pickUpload(uploadInput)}>Upload files…</button>
						<button disabled={blocked} onClick={() => pickUpload(folderInput)}>Upload folder…</button>
						<button disabled={blocked} onClick={() => pickUpload(zipInput)}>Import ZIP…</button>
						<button disabled={blocked} onClick={() => exportFolder(w.directory)}>Export folder as ZIP</button>
						<button disabled={blocked || !documents.length} onClick={() => w.closeDocuments(documents)}>Close all</button>
						<button disabled={blocked || documents.length < 2} onClick={() => w.closeDocuments(documents.filter(item => item !== doc))}>Close others</button>
						<button disabled={blocked || !w.model.closed.length} onClick={() => w.openFile(w.model.closed[0])}>Reopen closed file</button>
					</div></details>
				<button aria-label="Save file" title="Save (Ctrl/Cmd+S)" disabled={blocked || !doc?.loaded || doc.binary} onClick={save}><img src={saveIcon} alt="" /></button>
				<button disabled={blocked} onClick={quickOpen} title="Quick open (Ctrl/Cmd+P)">Quick open…</button>
				{recovery.available && <button disabled={blocked} onClick={() => w.perform('Recover drafts', recovery.recover)}>Recover drafts…</button>}
				<button disabled={blocked} onClick={openVsCode} aria-label="Open in VSCode" title="Open in VSCode"><img src={vsCodeIcon} alt="" /></button>
				<select aria-label="PHP version" value={phpVersion} disabled={debuggerActive} onChange={event => setPhpVersion(event.target.value)}>{['8.5', '8.4', '8.3', '8.2', '8.1', '8.0'].map(value => <option key={value}>{value}</option>)}</select>
				<button disabled={!!w.busy || !doc} title={debuggerActive ? 'Stop debugger' : 'Start debugger'} aria-label={debuggerActive ? 'Stop debugger' : 'Start debugger'} onClick={startDebugger}>{debuggerActive ? '⏹' : '▶'}</button>
				{isExecuting && ['step', 'continue', 'until', 'next', 'finish', 'leave'].map(command => <button key={command} onClick={() => openDbg.current?.[command]?.()}>{command}</button>)}
			</div>
			<div className="row editor-main">
				<aside className="file-area frame inset" aria-label="File explorer">
					<div className="editor-explorer-toolbar">
						<div className="editor-toolbar editor-explorer-actions inset" role="group" aria-label="File explorer actions">
							<span className="editor-explorer-title">Files</span>
							<button disabled={blocked} onClick={() => w.newEntry(false)} title="New file" aria-label="New file">
								<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14H3V2h7l3 3v3M10 2v4h3M9 12h6m-3-3v6" /></svg>
							</button>
							<button disabled={blocked} onClick={() => w.newEntry(true)} title="New folder" aria-label="New folder">
								<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 13H2V3h4l2 2h6v3M9 12h6m-3-3v6" /></svg>
							</button>
							<button onClick={() => void w.checkExternal()} title="Refresh files" aria-label="Refresh files">
								<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 6a5.5 5.5 0 1 0 .1 4M13.5 2v4h-4" /></svg>
							</button>
							<details ref={explorerMenu} className="editor-menu editor-explorer-menu" onClick={event => {
								if(event.target.closest('button:not(:disabled)'))
								{
									event.currentTarget.open = false;
									event.currentTarget.querySelector('summary').focus();
								}
							}} onKeyDown={event => {
								if(event.key === 'Escape')
								{
									event.preventDefault();
									event.stopPropagation();
									event.currentTarget.open = false;
									event.currentTarget.querySelector('summary').focus();
								}
							}} onBlur={event => {
								if(!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
							}}>
								<summary aria-label="More file actions" title="More file actions">⋯</summary>
								<div className="bevel">
									<button disabled={blocked} onClick={() => pickUpload(uploadInput)}>Upload files…</button>
									<hr />
									<button disabled={blocked} onClick={w.changeRoot}>Change root folder…</button>
									<button disabled={!doc?.path} onClick={() => {
										if(!withinPath(doc.path, w.root)) w.setRoot('/');
										w.select({path: doc.path, name: doc.name, kind: 'file'}, false);
										w.reveal(doc.path);
									}}>Reveal current file</button>
									<hr />
									<button disabled={blocked || !w.selected.size} onClick={() => w.copySelection(false)}>Copy</button>
									<button disabled={blocked || !w.selected.size} onClick={() => w.copySelection(true)}>Cut</button>
									<button disabled={blocked} onClick={w.paste}>Paste</button>
									<button disabled={blocked || !w.selected.size} onClick={w.removeSelected}>Delete…</button>
								</div>
							</details>
						</div>
						<div className="editor-explorer-filter"><input className="inset" aria-label="Filter visible files" title="Filter visible files" placeholder="Filter files…" value={filter} onChange={event => setFilter(event.target.value)} /></div>
					</div>
					<div className="editor-tree-scroll"><ul role="tree" aria-label="Filesystem" aria-multiselectable="true" onKeyDown={treeKeys}>
						<EditorFolder entry={{path: w.root, name: w.root, kind: 'directory', protected: ['/', '/persist', '/config'].includes(w.root)}} expanded={w.expanded} onExpand={w.expand} selected={w.selected} onSelect={w.select} onOpenFile={path => void w.openFile(path)} onMenu={entryMenu} onDrop={drop} refresh={w.refresh} filter={filter} />
					</ul></div>
					<label className="editor-sidebar-size">Explorer width<input type="range" min="180" max="600" value={sidebarWidth} onChange={event => {
						setSidebarWidth(Number(event.target.value));
						editor.current?.resize();
					}} /></label>
				</aside>
				<div className="edit-area">
					<nav className="editor-breadcrumbs" aria-label="Current file path">{doc?.path ? doc.path.split('/').filter(Boolean).map((part, index, parts) => <button key={index} title={'/' + parts.slice(0, index + 1).join('/')} onClick={() => {const path = '/' + parts.slice(0, index + 1).join('/'); if(index < parts.length - 1)
					{
						w.setRoot(path);
						w.expand(path, true);
						w.select({path, name: part, kind: 'directory'}, false);
					} else w.reveal(path);}}>{part}</button>) : <span>{doc?.name || 'Untitled'}</span>}</nav>
					<div className="tab-area frame" role="tablist" tabIndex={-1} aria-label="Open files" onKeyDown={event => {
						if(event.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
						const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
						const index = tabs.indexOf(event.target);
						const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
						event.preventDefault(); tabs[next].click(); tabs[next].focus();
					}}>{documents.map(file => <div className="tab" key={file.id} data-active={file.id === w.model.activeId}>
							<button role="tab" tabIndex={file.id === w.model.activeId ? 0 : -1} aria-selected={file.id === w.model.activeId} aria-controls="editor-document-panel" id={'tab-' + file.id} title={file.path || file.name} onClick={() => {
								w.selectDocument(file);
								if(file.path && !file.loaded) void w.openFile(file.path);
							}}>{documents.some(other => other !== file && other.name === file.name) ? file.path || file.name : file.name}{file.dirty ? ' *' : ''}{file.loading ? ' …' : ''}{file.saving ? ' (saving)' : ''}</button>
							<button aria-label={'Close ' + file.name} disabled={blocked || !!file.saving} onClick={() => w.closeDocuments([file])}>×</button>
						</div>)}</div>
					{w.error && <div className="editor-error" role="alert"><strong>{w.error.label}: </strong>{w.error.message} <button onClick={() => w.setError(null)}>Dismiss</button><button onClick={() => void w.checkExternal()}>Refresh filesystem</button></div>}
					{doc?.external && <div className="editor-notice" role="status">This file was {doc.external} on disk. Your buffer is unchanged. <button disabled={blocked} onClick={() => w.revert(doc)}>Reload…</button><button disabled={blocked} onClick={() => w.perform('Save As', () => w.saveDocument(doc, true))}>Save As…</button></div>}
					<div className="editor-document" role="tabpanel" id="editor-document-panel" aria-labelledby={doc ? 'tab-' + doc.id : undefined}>
						{!doc && <div className="editor-empty" role="status">Preparing editor…</div>}
						{doc?.loading && <div className="editor-empty" role="status">Loading {doc.name}…</div>}
						{doc?.error && !doc.loaded && <div className="editor-empty"><button onClick={() => w.openFile(doc.path)}>Retry opening {doc.name}</button></div>}
						{doc?.binary && <div className="editor-empty">Binary or unsupported text encoding. Text editing is disabled.<button onClick={downloadCurrent}>Download original file</button>{preview && <img className="editor-image-preview" src={preview} alt={doc.name} />}</div>}
						<div id="edit-root" hidden={!doc || doc.binary || !!doc.loading || !doc.loaded}>
							<AceEditor name="input" width="100%" height="100%" theme="monokai" onLoad={handleEditorLoad} setOptions={{useWorker: false}} />
						</div>
					</div>
					{debuggerActive && <div className="editor-debugger inset"><Debugger file={debuggerStartFile} initCommands={debuggerCommands} onStdIn={() => void gotoFile(currentBreak.current.file, currentBreak.current.line)} openFile={gotoFile} ref={openDbg} setCurrentFile={file => currentBreak.current.file = file} setCurrentLine={line => currentBreak.current.line = line} setIsExecuting={setIsExecuting} version={phpVersion} /></div>}
				</div>
			</div>
			<div className="editor-statusbar" role="group" aria-label="Editor status">
				<div className="editor-status editor-status-panel inset" role="status" aria-live="polite">{w.status}</div>
				<div className="editor-status-panel inset" title={doc?.writable === false ? 'Read-only file — use Save As to create an editable copy' : doc?.path && !isPersistentPath(doc.path) ? 'Temporary filesystem — download to keep a copy' : undefined}>
					{doc?.writable === false && 'Read-only · '}{doc?.path ? isPersistentPath(doc.path) ? 'Persistent storage' : 'Temporary file' : 'Unsaved document'}
				</div>
				{doc && !doc.binary && <div className="editor-status-panel editor-status-format inset">
					<span>{doc.bom ? 'UTF-8 with BOM' : 'UTF-8'}</span>
					<select aria-label="Line endings" disabled={blocked} value={doc.eol} onChange={event => {
						doc.eol = event.target.value;
						doc.session.setNewLineMode(doc.eol);
						doc.dirty = !doc.path || doc.session.getValue() !== doc.baseline;
						w.model.emit();
					}}><option value="unix">LF</option><option value="windows">CRLF</option></select>
				</div>}
				<div className="editor-status-panel inset" title="Draft recovery keeps unsaved edits separate from files. Use Save to write the file.">{recovery.status}</div>
				{storage && <div className="editor-status-panel inset" title="Browser storage used / available quota. Shared by this site's demos." aria-label={`${(storage.usage / 1048576).toFixed(1)} MiB used / ${(storage.quota / 1048576).toFixed(0)} MiB available quota`}>
					{(storage.usage / 1048576).toFixed(1)} / {(storage.quota / 1048576).toFixed(0)} MiB
				</div>}
			</div>
		</div>
		{w.dialog && <EditorDialog key={w.dialog.key} dialog={w.dialog} finish={w.finish} />}
		{showQuickOpen && <EditorQuickOpen root={w.root} recent={w.model.recent} onOpen={w.openFile} onClose={() => setShowQuickOpen(false)} />}
		<input ref={uploadInput} type="file" multiple hidden onChange={picked} aria-label="Upload files" />
		<input ref={folderInput} type="file" multiple webkitdirectory="" hidden onChange={picked} aria-label="Upload folder" />
		<input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={importZip} aria-label="Import ZIP" />
	</div>;
}
