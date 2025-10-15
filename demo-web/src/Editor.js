import './Common.css';
import './Editor.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sendMessageFor } from 'php-cgi-wasm/msg-bus';
import EditorFolder from './EditorFolder';
import Header from './Header';

import ace from 'ace-builds';
import AceEditor from "react-ace-builds";
import { Range } from "ace-builds";
import "react-ace-builds/webpack-resolver-min";
import { createRoot } from 'react-dom/client';

import reactIcon from './react-icon.svg';
import redCircle from './circle-red.svg';
import toggleIcon from './nuvola/view_choose.png';
import saveIcon from './nuvola/3floppy_unmount.png';
import Debugger from './Debugger';

// const sendMessage = sendMessageFor((`${window.location.origin}${process.env.PUBLIC_URL}/cgi-worker.mjs`));
const sendMessage = sendMessageFor(navigator.serviceWorker.controller);

const openFilesMap = new Map();
const sessionsMap = new WeakMap;

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

const breakpoints = new Map;

export default function Editor() {
	const [contents, setContents] = useState('...');
	const [openFiles, setOpenFiles] = useState([]);
	const [showLeft, setShowLeft] = useState([]);
	const [phpdbg, setPhpDbg] = useState(false);

	const activeLines = useRef(new Set);
	const currentBreak = useRef({});
	const currentPath = useRef(null);
	const editBox = useRef(null);
	const aceRef = useRef(null);
	const tabBox = useRef(null);
	const openDbg = useRef(null);

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	const handleSave = async () => {
		if(currentPath.current)
		{
			const entry = openFilesMap.get(currentPath.current);
			entry.dirty = false;

			sendMessage('writeFile', [
				currentPath.current
				, new TextEncoder().encode(aceRef.current.editor.getValue())
			]);

			const openFilesList = [...openFilesMap.entries()].map(e => e[1]);
			setOpenFiles(openFilesList);
		}
	};

	const onKeyDown = event => {
		if(event.key === 's' && event.ctrlKey)
			{
			event.preventDefault();
			handleSave();
			return;
		}
	};

	const toggleLeftBar = () => {
		setShowLeft(!showLeft);
	};

	useEffect(() => {
		if(!editBox.current)
		{
			editBox.current = document.getElementById('edit-root');
			const editRoot = createRoot(editBox.current);

			editRoot.render(
				<AceEditor
					mode = "php"
					theme = "monokai"
					// onChange = {codeChanged}
					name = "input"
					width = "100%"
					height = "100%"
					ref = {aceRef}
				/>
			);
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('editor-open-file', handleOpenFile);
		return () => {
			window.removeEventListener('editor-open-file', handleOpenFile);
			window.removeEventListener('keydown', onKeyDown);
		}
	}, []);

	const closeFile = async path => {
		const entry = openFilesMap.get(path);

		openFilesMap.delete(path);

		if(entry.active)
		{
			if(openFilesMap.size)
			{
				const first = [...openFilesMap.entries()][0][1];
				first.active = true;
				currentPath.current = first.path;
				aceRef.current.editor.setSession(first.session);
			}
			else
			{
				currentPath.current = null;
				aceRef.current.editor.setSession(ace.createEditSession('', 'ace/mode/text'));
				aceRef.current.editor.setReadOnly(true);
			}
		}

		const openFilesList = [...openFilesMap.entries()].map(e => e[1]);
		setOpenFiles(openFilesList);
	};

	const openFile = async path => {
		const editor = aceRef.current.editor;

		const name = path.split('/').pop();
		const newFile = openFilesMap.has(path)
			? openFilesMap.get(path)
			: {name, path};

		query.set('path', path);

		if(!openDbg.current)
		{
			window.history.replaceState({}, null, window.location.pathname + '?' + query);
		}

		currentPath.current = path;

		editor.setReadOnly(!!openDbg.current);

		if(!newFile.session)
		{
			openFilesMap.set(path, newFile);
		}

		const openFilesList = [...openFilesMap.entries()].map(e => e[1]);
		openFilesList.map(f => f.active = false);
		newFile.active = true;
		setOpenFiles(openFilesList);

		if(newFile.loading)
		{
			editor.setSession(await newFile.loading);
			return;
		}

		let _accept;
		newFile.loading = new Promise(accept => _accept = accept);

		const extension = path.split('.').pop();
		const mode = modes[extension] ?? 'ace/mode/text';

		const code = new TextDecoder().decode(
			await sendMessage('readFile', [path])
		);

		newFile.session = ace.createEditSession(code, mode);
		sessionsMap.set(newFile.session, newFile);
		editor.setSession(newFile.session);
		setContents(code);

		_accept(newFile.session);

		newFile.dirty = false;

		newFile.session.on('change', () => {
			newFile.dirty = true;
			const openFilesList = [...openFilesMap.entries()].map(e => e[1]);
			setOpenFiles(openFilesList);
		});

		// editor.setOption("firstLineNumber", 0);

		tabBox.current.scrollTo({left:-tabBox.current.scrollWidth, behavior: 'smooth'});
	};

	useEffect(() => {
		console.log(aceRef.current);
		if(aceRef.current)
		{
			const onGutter = async event => {

				const editor = aceRef.current.editor;
				console.log(event);

				const session = editor.getSession();

				if(!sessionsMap.has(session))
				{
					console.trace('Unmapped session!');
					return;
				}

				const {path} = sessionsMap.get(session);

				const target = event.domEvent.target;

				if(target.className.indexOf("ace_gutter-cell") == -1)
				{
					return;
				}

				if(event.clientX > 28 + target.getBoundingClientRect().left)
				{
					return;
				}

				const line = event.getDocumentPosition().row;
				// const existing = event.editor.session.getBreakpoints(line, 0);

				if(!breakpoints.has(`${path}:${1 + line}`))
				{
					event.editor.session.setBreakpoint(line);

					let id = breakpoints.size;

					if(openDbg.current)
					{
						openDbg.current.setBreakpoint(path, 1 + line);
						id = await openDbg.current.bpCount();
					}

					breakpoints.set(`${path}:${1 + line}`, id);
				}
				else
				{
					const id = breakpoints.get(`${path}:${1 + line}`);

					event.editor.session.clearBreakpoint(line);

					if(openDbg.current)
					{
						openDbg.current.clearBreakpoint(id);
					}

					breakpoints.delete(`${path}:${1 + line}`);
				}

				console.log(breakpoints);

				event.stop();
			};

			aceRef.current.editor.on('guttermousedown', onGutter);

			return () => {
				aceRef.current.editor.session.off('off', onGutter);
			};
		}
	}, [aceRef.current]);

	const handleOpenFile = event => openFile(event.detail);

	const startDebugger = () => {

		const editor = aceRef.current.editor;

		if(openDbg.current)
		{
			activeLines.current.forEach(m => editor.session.removeMarker(m));
			openDbg.current = null;
			editor.setReadOnly(false);
			setPhpDbg(openDbg.current);
			return;
		}

		editor.setReadOnly(true);

		openDbg.current = <Debugger
			file = {currentPath.current}
			ref = {openDbg}
			initCommands = {[...[...breakpoints.keys()].map(bp => `b ${bp}`), 'run']}
			setCurrentFile = {file => currentBreak.current.file = file}
			setCurrentLine = {line => currentBreak.current.line = line}
			onStdIn = {async () => {
				const file = currentBreak.current.file;
				const line = currentBreak.current.line;

				activeLines.current.forEach(m => editor.session.removeMarker(m));

				if(file && line)
				{
					await openFile(file);

					const marker = editor.session.addMarker(
						new Range(-1 + line, 0, -1 + line, Infinity), 'active_breakpoint', 'fullLine', true
					);

					editor.scrollToLine(-1 + line, true, true, () => {});

					activeLines.current.add(marker);
				}
			}}
		/>;

		setPhpDbg(openDbg.current);
	};

	const handleStartDebugger = event => startDebugger();
	const handleRun = event => openDbg.current.run();
	const handleStep = event => openDbg.current.step();
	const handleContinue = event => openDbg.current.continue();
	const handleUntil = event => openDbg.current.until();
	const handleNext = event => openDbg.current.next();
	const handleFinish = event => openDbg.current.finish();
	const handleLeave = event => openDbg.current.leave();

	return (
		<div className = "editor" data-show-left = {showLeft}>
			<div className='bevel'>
				<Header />
				<div className = "row toolbar inset tight">
					<button className='square' onClick = {toggleLeftBar}>
						<img src = {toggleIcon} />
					</button>
					<button className='square' onClick = {handleSave}>
						<img src = {saveIcon} />
					</button>
					{!phpdbg ? (
						<button className='square' title = "Debugger" onClick = {handleStartDebugger}>
							▶
						</button>
					) : (
						<span className='contents'>
						<button className='square' title = "Stop Debugger" onClick = {handleStartDebugger}>
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
							<EditorFolder path = "/" name = "/" />
						</div>
					</div>
					<div className='edit-area'>
						<div className = "inset column grow">
							<div className = "tab-area frame">
								<div className='scroller' ref = {tabBox}>
								{openFiles.map(file =>
									<div className='tab' key = {file.path} data-active = {file.active}>
										<div onClick = { () => openFile(file.path)}>
											{file.name} {file.dirty ? '!' : ''}
										</div>
										<div onClick = { () => closeFile(file.path)}>×</div>
									</div>
								)}
								</div>
							</div>
							<div className='frame grow'>
								<div id = "edit-root" className = "scroller">
									<pre>{contents}</pre>
								</div>
							</div>
						</div>
						{phpdbg && (
							<div className='inset row grow'><div className='frame grow'>{phpdbg}</div></div>
						)}
					</div>
				</div>
				<div className = "inset right demo-bar">
					<span>Demo powered by React</span> <img src = {reactIcon} className='small-icon'/>
				</div>
			</div>
		</div>
	);
}
