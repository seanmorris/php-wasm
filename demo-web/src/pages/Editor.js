import '../styles/Common.css';
import '../styles/Editor.css';

import { useCallback, useEffect, useRef, useState } from 'react';

import EditorFolder from '../components/EditorFolder';
import Header from '../components/Header';
import { getPhpBus } from '../lib/phpBus';
import { basePath } from '../lib/runtimePaths';

import ace from 'ace-builds';
import AceEditor from 'react-ace';
import { Range } from "ace-builds";
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

import reactIcon from '../assets/frameworks/react-icon.svg';
import toggleIcon from '../assets/nuvola/view_choose.png';
import saveIcon from '../assets/nuvola/3floppy_unmount.png';
import vsCodeIcon from '../assets/icons/vscode-16.png';

import Debugger from '../components/Debugger';

const modes = {
	'php': 'ace/mode/php'
	, 'phtml': 'ace/mode/php'
	, 'module': 'ace/mode/php'
	, 'inc': 'ace/mode/php'
	, 'js': 'ace/mode/javascript'
	, 'json': 'ace/mode/json'
	, 'html': 'ace/mode/html'
	, 'css': 'ace/mode/css'
	, 'md': 'ace/mode/markdown'
	, 'mjs': 'ace/mode/javascript'
	, 'txt': 'ace/mode/text'
	, 'xml': 'ace/mode/xml'
	, 'yml': 'ace/mode/yaml'
	, 'yaml': 'ace/mode/yaml'
};

export default function Editor()
{
	const [openFiles, setOpenFiles] = useState([]);
	const [showLeft, setShowLeft] = useState(true);
	const [debuggerActive, setDebuggerActive] = useState(false);
	const [debuggerStartFile, setDebuggerStartFile] = useState(null);
	const [debuggerInitCommands, setDebuggerInitCommands] = useState([]);
	const [isExecuting, setIsExecuting] = useState(false);
	const [editorReady, setEditorReady] = useState(false);

	const aceRef = useRef(null);
	const editorInstance = useRef(null);
	const activeLines = useRef(new Set);
	const breakpoints = useRef(new Map);
	const currentBreak = useRef({});
	const currentPath = useRef(null);
	const openDbg = useRef(null);
	const openFilesMap = useRef(new Map());
	const pathStates = useRef(new Map());
	const pendingOpenPath = useRef(null);
	const sessionsMap = useRef(new WeakMap);
	const tabBox = useRef(null);

	const lastFile = useRef(null);
	const lastLine = useRef(null);

	const versionSelector = useRef(null);
	const version = useRef('8.3');

	const query = useRef(null);
	const startPath = useRef('/');

	if(!query.current)
	{
		query.current = new URLSearchParams(window.location.search);
		startPath.current = query.current.get('path') || '/';
	}

	const updateOpenFiles = useCallback(() => {
		setOpenFiles([...openFilesMap.current.values()]);
	}, []);

	const handleSave = useCallback(async () => {
		if(!currentPath.current)
		{
			return;
		}

		const entry = openFilesMap.current.get(currentPath.current);

		if(!entry)
		{
			return;
		}

		entry.dirty = false;
		const bus = await getPhpBus();

		await bus.writeFile(
			currentPath.current
			, new TextEncoder().encode(editorInstance.current.getValue())
		);

		updateOpenFiles();
	}, [updateOpenFiles]);

	const handleOpenVsCode = useCallback(() => {
		if(currentPath.current)
		{
			window.location.href = basePath(`vscode.html?path=${currentPath.current}`);
			return;
		}

		window.location.href = basePath('vscode.html');
	}, []);

	const handleWindowKeyDown = useCallback(event => {
		if((event.ctrlKey || event.metaKey) && event.key === 's')
		{
			event.preventDefault();
			void handleSave();
		}
	}, [handleSave]);

	const toggleLeftBar = useCallback(() => {
		setShowLeft(showLeft => !showLeft);
	}, []);

	const openFile = useCallback(async path => {
		const editor = editorInstance.current;

		if(!editor)
		{
			pendingOpenPath.current = path;
			return;
		}

		const name = path.split('/').pop();
		const newFile = openFilesMap.current.has(path)
			? openFilesMap.current.get(path)
			: {name, path};

			query.current.set('path', path);

		if(!openDbg.current)
		{
			window.history.replaceState({}, null, window.location.pathname + '?' + query.current);
		}

		if(currentPath.current !== path)
		{
			activeLines.current.forEach(marker => {
				editor.session.removeMarker(marker);
				activeLines.current.delete(marker);
			});
		}

		currentPath.current = path;

		editor.setReadOnly(debuggerActive);

		if(!newFile.session)
		{
			openFilesMap.current.set(path, newFile);
		}

		for(const file of openFilesMap.current.values())
		{
			file.active = false;
		}

		newFile.active = true;
		updateOpenFiles();

		if(newFile.loading)
		{
			editor.setSession(await newFile.loading);
			return;
		}

		let acceptLoading;
		newFile.loading = new Promise(accept => acceptLoading = accept);

		const extension = path.split('.').pop();
		const mode = modes[extension] ?? 'ace/mode/text';
		const bus = await getPhpBus();

		const code = new TextDecoder().decode(
			await bus.readFile(path)
		);

		newFile.session = ace.createEditSession(code, mode);
		sessionsMap.current.set(newFile.session, newFile);
		editor.setSession(newFile.session);
		acceptLoading(newFile.session);

		newFile.dirty = false;

		newFile.session.on('change', () => {
			newFile.dirty = true;
			updateOpenFiles();
		});

		tabBox.current?.scrollTo({left: -tabBox.current.scrollWidth, behavior: 'smooth'});
	}, [debuggerActive, updateOpenFiles]);

	const closeFile = useCallback(async path => {
		const entry = openFilesMap.current.get(path);

		if(!entry)
		{
			return;
		}

		openFilesMap.current.delete(path);

		if(entry.active)
		{
			if(openFilesMap.current.size)
			{
				const first = [...openFilesMap.current.values()][0];
				first.active = true;
				currentPath.current = first.path;
				editorInstance.current.setSession(first.session);
			}
			else
			{
				currentPath.current = null;
				editorInstance.current.setSession(ace.createEditSession('', 'ace/mode/text'));
				editorInstance.current.setReadOnly(true);
			}
		}

		updateOpenFiles();
	}, [updateOpenFiles]);

	const gotoFile = useCallback(async (file, line) => {
		const editor = editorInstance.current;

		if(!editor)
		{
			return;
		}

		const bus = await getPhpBus();
		const { exists } = await bus.analyzePath(file);

		if(exists)
		{
			await openFile(file);
			editor.scrollToLine(-1 + line, true, true, () => {});
		}

		if(line === undefined)
		{
			return;
		}

		activeLines.current.forEach(marker => {
			editor.session.removeMarker(marker);
			activeLines.current.delete(marker);
		});

		const marker = editor.session.addMarker(
			new Range(-1 + line, 0, -1 + line, Infinity)
			, 'active_breakpoint'
			, 'fullLine'
			, true
		);

		activeLines.current.add(marker);
	}, [openFile]);

	const handleDebuggerStdIn = useCallback(async () => {
		const editor = editorInstance.current;
		const file = currentBreak.current.file;
		const line = currentBreak.current.line;

		if(!(editor && file && line))
		{
			return;
		}

		if(file === lastFile.current && line === lastLine.current)
		{
			return;
		}

		const bus = await getPhpBus();
		const { exists } = await bus.analyzePath(file);

		if(exists)
		{
			await openFile(file);

			activeLines.current.forEach(marker => {
				editor.session.removeMarker(marker);
				activeLines.current.delete(marker);
			});

			const marker = editor.session.addMarker(
				new Range(-1 + line, 0, -1 + line, Infinity)
				, 'active_breakpoint'
				, 'fullLine'
				, true
			);

			activeLines.current.add(marker);
			editor.scrollToLine(-1 + line, true, true, () => {});

			lastFile.current = file;
			lastLine.current = line;
			return;
		}

		activeLines.current.forEach(marker => {
			editor.session.removeMarker(marker);
			activeLines.current.delete(marker);
		});
	}, [openFile]);

	const startDebugger = useCallback(() => {
		const editor = editorInstance.current;

		if(!editor)
		{
			return;
		}

		if(openDbg.current)
		{
			activeLines.current.forEach(marker => {
				editor.session.removeMarker(marker);
				activeLines.current.delete(marker);
			});

			editor.setReadOnly(false);
			setDebuggerActive(false);
			setDebuggerStartFile(null);
			setDebuggerInitCommands([]);
			setIsExecuting(false);
			return;
		}

		editor.setReadOnly(true);
		setDebuggerStartFile(currentPath.current);
		setDebuggerInitCommands([
			...[...breakpoints.current.keys()].map(bp => `b ${bp}`)
			, 'run'
		]);
		setDebuggerActive(true);
	}, []);

	useEffect(() => {
		window.addEventListener('keydown', handleWindowKeyDown);
		return () => {
			window.removeEventListener('keydown', handleWindowKeyDown);
		};
	}, [handleWindowKeyDown]);

	useEffect(() => {
		if(!editorReady)
		{
			return;
		}

		if(startPath.current !== '/' && !pendingOpenPath.current)
		{
			pendingOpenPath.current = startPath.current;
		}

		if(!pendingOpenPath.current)
		{
			return;
		}

		const path = pendingOpenPath.current;
		pendingOpenPath.current = null;
		void openFile(path);
	}, [editorReady, openFile]);

	useEffect(() => {
		if(!editorReady)
		{
			return;
		}

		const editor = editorInstance.current;

		if(!editor)
		{
			return;
		}

		const onGutter = async event => {
			const session = editor.getSession();
			const target = event.domEvent.target;
			const gutterCell = target?.closest?.('.ace_gutter-cell')
				|| (typeof target?.className === 'string' && target.className.indexOf('ace_gutter-cell') !== -1
					? target
					: null
				);

			if(!gutterCell)
			{
				return;
			}

			if(!sessionsMap.current.has(session) && currentPath.current)
			{
				sessionsMap.current.set(session, {path: currentPath.current});
			}

			if(!sessionsMap.current.has(session))
			{
				console.trace('Unmapped session!');
				return;
			}

			const {path} = sessionsMap.current.get(session);

			if(event.clientX > 28 + gutterCell.getBoundingClientRect().left)
			{
				return;
			}

			const line = event.getDocumentPosition().row;
			const breakpointKey = `${path}:${1 + line}`;

				if(!breakpoints.current.has(breakpointKey))
				{
					event.editor.session.setBreakpoint(line);

					let id = breakpoints.current.size;

					if(openDbg.current)
					{
						id = await openDbg.current.setBreakpoint(path, 1 + line);
					}

					breakpoints.current.set(breakpointKey, id);
				}
			else
			{
				const id = breakpoints.current.get(breakpointKey);

					event.editor.session.clearBreakpoint(line);

					if(openDbg.current)
					{
						await openDbg.current.clearBreakpoint(id);
					}

					breakpoints.current.delete(breakpointKey);
			}

				event.editor.renderer.updateBreakpoints();
				event.domEvent.preventDefault();
				event.domEvent.stopPropagation();
				event.stop();
		};

		editor.on('guttermousedown', onGutter);

		return () => {
			editor.off('guttermousedown', onGutter);
		};
	}, [editorReady]);

	const handleEditorLoad = useCallback(editor => {
		editorInstance.current = editor;
		editor.setSession(ace.createEditSession('', 'ace/mode/text'));
		editor.setReadOnly(true);
		setEditorReady(true);
	}, []);

	const handleStep = () => openDbg.current?.step();
	const handleContinue = () => openDbg.current?.continue();
	const handleUntil = () => openDbg.current?.until();
	const handleNext = () => openDbg.current?.next();
	const handleFinish = () => openDbg.current?.finish();
	const handleLeave = () => openDbg.current?.leave();

	return (
		<div className = "editor" data-show-left = {showLeft}>
			<div className='bevel'>
				<Header />
				<div className = "row toolbar inset tight">
					<button className='square' onClick = {toggleLeftBar}>
						<img src = {toggleIcon} alt = "" />
					</button>
					<button className='square' onClick = {handleSave}>
						<img src = {saveIcon} alt = "" />
					</button>
					<button className='square' onClick = {handleOpenVsCode}>
						<img src = {vsCodeIcon} alt = "" />
					</button>
					{!isExecuting ? (
						<>
							{debuggerActive ? '' : <select className='bevel' defaultValue = {version.current} ref={versionSelector} onChange={() => version.current = versionSelector.current.value}>
								<option>8.5</option>
								<option>8.4</option>
								<option>8.3</option>
								<option>8.2</option>
								<option>8.1</option>
								<option>8.0</option>
							</select>}
							<button className='square' title = "Debugger" onClick = {startDebugger}>
								{debuggerActive ? '⏹' : '▶'}
							</button>
						</>
					) : (
						<span className='contents'>
							<button className='square' title = "Stop Debugger" onClick = {startDebugger}>
								⏹
							</button>
							<button title = "Step" className='square' onClick = {handleStep}>
								⇥
							</button>
							<button title = "Continue" className='square' onClick = {handleContinue}>
								→
							</button>
							<button title = "Until" className='square' onClick = {handleUntil}>
								⤻
							</button>
							<button title = "Next" className='square' onClick = {handleNext}>
								↦
							</button>
							<button title = "Finish" className='square' onClick = {handleFinish}>
								↑
							</button>
							<button title = "Leave" className='square' onClick = {handleLeave}>
								↳
							</button>
						</span>
					)}
				</div>
				<div className = "row">
					<div className = "file-area frame inset">
						<div className = "scroller">
							<EditorFolder
								name = "/"
								onOpenFile = {openFile}
								path = "/"
								pathStates = {pathStates}
								startPath = {startPath.current}
							/>
						</div>
					</div>
					<div className='edit-area'>
						<div className = "inset column grow">
							<div className = "tab-area frame">
								<div className='scroller' ref = {tabBox}>
									{openFiles.map(file =>
										<div className='tab' key = {file.path} data-active = {file.active}>
											<div onClick = {() => openFile(file.path)}>
												{file.name} {file.dirty ? '!' : ''}
											</div>
											<div onClick = {() => closeFile(file.path)}>×</div>
										</div>
									)}
								</div>
							</div>
							<div className='frame grow'>
								<div id = "edit-root" className = "scroller">
									<AceEditor
										height = "100%"
										mode = "php"
										name = "input"
										onLoad = {handleEditorLoad}
										ref = {aceRef}
										theme = "monokai"
										width = "100%"
									/>
								</div>
							</div>
						</div>
						{debuggerActive && (
							<div className='inset row grow'>
								<div className='frame grow'>
									<Debugger
										file = {debuggerStartFile}
										initCommands = {debuggerInitCommands}
										onStdIn = {handleDebuggerStdIn}
										openFile = {gotoFile}
										ref = {openDbg}
										setCurrentFile = {file => currentBreak.current.file = file}
										setCurrentLine = {line => currentBreak.current.line = line}
										setIsExecuting = {setIsExecuting}
										version = {version.current}
									/>
								</div>
							</div>
						)}
					</div>
				</div>
				<div className = "inset right demo-bar">
					<span>Demo powered by React</span> <img src = {reactIcon} className='small-icon' alt = "React logo" />
				</div>
			</div>
		</div>
	);
}
