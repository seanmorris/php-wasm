import './Common.css';
import './Editor.css';

import { useEffect, useMemo, useRef, useState } from 'react';

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

const sendMessage = sendMessageFor((`${window.location.origin}${process.env.PUBLIC_URL}/cgi-worker.mjs`))

const openFilesMap = new Map();

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
	const currentPath = useRef(null);
	const editBox = useRef(null);
	const aceRef = useRef(null);
	const tabBox = useRef(null);

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
		const name = path.split('/').pop();
		const newFile = openFilesMap.has(path)
			? openFilesMap.get(path)
			: {name, path};

		query.set('path', path);

		window.history.replaceState({}, null, window.location.pathname + '?' + query);

		currentPath.current = path;

		const editor = aceRef.current.editor;

		editor.setReadOnly(false);

		if(!newFile.session)
		{
			openFilesMap.set(path, newFile);
		}

		const openFilesList = [...openFilesMap.entries()].map(e => e[1]);

		openFilesList.map(f => f.active = false);

		newFile.active = true;

		setOpenFiles(openFilesList);

		if(newFile.session)
		{
			editor.setSession(newFile.session);
			return;
		}

		const code = new TextDecoder().decode(
			await sendMessage('readFile', [path])
		);

		setContents(code);

		const extension = path.split('.').pop();
		const mode = modes[extension] ?? 'ace/mode/text';

		newFile.session = ace.createEditSession(code, mode);

		newFile.dirty = false;

		newFile.session.on('change', () => {
			newFile.dirty = true;
			const openFilesList = [...openFilesMap.entries()].map(e => e[1]);
			setOpenFiles(openFilesList);
		});

		editor.setSession(newFile.session);

		editor.on("guttermousedown", event => {
			const target = event.domEvent.target;

			if (target.className.indexOf("ace_gutter-cell") == -1)
			{
				return;
			}

			if (!editor.isFocused())
			{
				return;
			}

			if (event.clientX > 28 + target.getBoundingClientRect().left)
			{
				return;
			}

			const line = event.getDocumentPosition().row;
			const existing = event.editor.session.getBreakpoints(line, 0);

			if(!breakpoints.has(`${path}:${line}`))
			{
				console.log(line);
				event.editor.session.setBreakpoint(line);
				const marker = event.editor.session.addMarker(new Range(line, 0, line, Infinity), 'active_breakpoint', 'fullLine', true);
				breakpoints.set(`${path}:${line}`, marker);
			}
			else
			{
				event.editor.session.clearBreakpoint(line);
				event.editor.session.removeMarker( breakpoints.get(`${path}:${line}`) );
				breakpoints.delete(`${path}:${line}`);
			}

			console.log(breakpoints);

			event.stop();
		});

		tabBox.current.scrollTo({left:-tabBox.current.scrollWidth, behavior: 'smooth'});
	};

	const handleOpenFile = async event => openFile(event.detail);

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
				</div>
				<div className = "row">
					<div className = "file-area frame inset">
						<div className = "scroller">
							<EditorFolder path = "/" name = "/" />
						</div>
					</div>
					<div className = "edit-area inset">
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
				</div>
				<div className = "inset right demo-bar">
					<span>Demo powered by React</span> <img src = {reactIcon} className='small-icon'/>
				</div>
			</div>
		</div>
	);
}
