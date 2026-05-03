import './Common.css';
import './EditorEntry.css';

import cmdIcon from './icons/cmd-icon-16.png';
import fileIcon from './nomo-dark/file.svg';
import filePhpIcon from './nomo-dark/file.php.svg';
import fileJsIcon from './nomo-dark/file.js.svg';
import fileTxtIcon from './nomo-dark/file.txt.svg';
import fileHtmlIcon from './nomo-dark/file.html.svg';
import fileMdIcon from './nomo-dark/file.markdown.svg';
import fileJsonIcon from './nomo-dark/file.json.svg';
import fileShIcon from './nomo-dark/file.sh.svg';
import fileCssIcon from './nomo-dark/file.css.svg';
import fileXmlIcon from './nomo-dark/file.xml.svg';
import fileYmlIcon from './nomo-dark/file.yaml.svg';
import fileZipIcon from './nomo-dark/file.zip.svg';

import renameIcon from './icons/rename-icon-16.png';
import deleteIcon from './icons/delete-icon-16.png';

import { useEffect, useRef, useState } from 'react';
import { sendMessageFor } from 'php-cgi-wasm/msg-bus.mjs';
import { baseUrlFor } from './runtimePaths';

// const sendMessage = sendMessageFor((`${window.location.origin}${basePath('cgi-worker.mjs')}`));
const sendMessage = sendMessageFor(navigator.serviceWorker.controller);

const icons = {
	php: filePhpIcon
	, module: filePhpIcon
	, inc: filePhpIcon
	, js: fileJsIcon
	, mjs: fileJsIcon
	, txt: fileTxtIcon
	, html: fileHtmlIcon
	, json: fileJsonIcon
	, md: fileMdIcon
	, sh: fileShIcon
	, css: fileCssIcon
	, xml: fileXmlIcon
	, yml: fileYmlIcon
	, yaml: fileYmlIcon
	, zip: fileZipIcon
};

export default function EditorFile({path, name, onOpenFile, startPath = '/'})
{
	const [showContext, setShowContext] = useState(false);
	const [showRename, setShowRename]   = useState(false);
	const [deleted, setDeleted]         = useState(false);
	const [_name, setName] = useState(name);
	const [_path, setPath] = useState(path);
	const box = useRef(null);
	const hasFocusedStartPath = useRef(false);

	const onContext = event => {
		event.preventDefault();
		if(!showRename)
		{
			setShowContext(true);
		}
	};

	const onBlur = () => setTimeout(() => setShowContext(false), 160);

	const openFile = () => {
		void onOpenFile(_path);
	};

	const renameFile = () => {
		setShowRename(true);
	};

	const openPhpDbg = path => {
		const q = new URLSearchParams({path});
		const u = new URL(
			'./dbg-preview.html?' + q.toString()
			, baseUrlFor()
		);

		window.open(u);
	};

	const deleteFile = async () => {
		await sendMessage('unlink', [_path]);
		setShowContext(false);
		setDeleted(true);
	};

	const renameKeyUp = async event => {
		if(event.key === 'Enter')
		{
			if(event.target.value)
			{
				const dirPath = _path.substr(0, _path.length - _name.length);
				const newPath = dirPath + event.target.value;

				await sendMessage('rename', [_path, newPath]);

				setName(event.target.value);
				setPath(newPath);
				void onOpenFile(newPath);
			}

			setShowRename(false);
		}

		if(event.key === 'Escape')
		{
			setShowRename(false);
		}
	};

	useEffect(() => {
		if(startPath !== path || hasFocusedStartPath.current)
		{
			return;
		}

		hasFocusedStartPath.current = true;
		box.current?.focus();
	}, [path, startPath]);

	const extension = _path.split('.').pop();

	return !deleted && (
		<div className = "editor-entry editor-file">
			<p onClick = {openFile} tabIndex="0" onContextMenu={onContext} onBlur = {onBlur} ref = {box}>
				<img className = "file icon" src = {icons[extension] ?? fileIcon} alt = "" />
				{_name}
			</p>
			{showContext && <span className = "contents only-focus">
				{extension === 'php' && (
					<p className = "context" onClick = {() => openPhpDbg(_path)}>
						<img className = "file icon" src = {cmdIcon} alt = "" />
						Open in PHP-DBG
					</p>
				)}
				<p className = "context" onClick = {renameFile}>
					<img className = "file icon" src = {renameIcon} alt = "" />
					Rename
				</p>
				<p className = "context" onClick = {deleteFile}>
					<img className = "file icon" src = {deleteIcon} alt = "" />
					Delete
				</p>
			</span>}
			{showRename && <p className = "context">
				<img className = "file icon" src = {fileIcon} alt = "" />
				<input placeholder='filename' onKeyUp = {renameKeyUp} autoFocus={true} defaultValue = {_name} />
			</p>}
		</div>
	);
}
