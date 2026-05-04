import '../styles/Common.css';
import '../styles/EditorEntry.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import EditorFile from './EditorFile';
import { getPhpBus } from '../lib/phpBus';

import fileIcon from '../assets/nomo-dark/file.svg';
import folderOpen from '../assets/nomo-dark/folder.open.svg';
import folderClose from '../assets/nomo-dark/folder.close.svg';
import loader from '../assets/ui/bar-spin.svg';

export default function EditorFolder({
	path = '/'
	, name = ''
	, onOpenFile
	, pathStates
	, startPath = '/'
}) {
	const [dirs, setDirs]                   = useState([]);
	const [showContext, setShowContext]     = useState(false);
	const [showNewFile, setShowNewFile]     = useState(false);
	const [showNewFolder, setShowNewFolder] = useState(false);
	const [files, setFiles]                 = useState([]);
	const [loading, setLoading]             = useState(false);
	const box = useRef(null);

	const startOpened = pathStates.current.has(path)
		? pathStates.current.get(path)
		: (path === startPath.substr(0, path.length));

	const [expanded, setExpanded] = useState(startOpened);

	const onContext = event => {
		event.preventDefault();
		setExpanded(true);
		setShowNewFolder(false);
		setShowNewFile(false);
		setShowContext(true);
	};

	const onBlur = () => setTimeout(() => setShowContext(false), 160);

	const loadFiles = useCallback(async () => {
		setLoading(true);
		const bus = await getPhpBus();
		const entries = (await bus.readdir(path))
			.filter(file => file !== '.' && file !== '..');
		const types = await Promise.all(entries.map(async file =>
			(await bus.analyzePath(path + (path[path.length - 1] !== '/' ? '/' : '') + file))
			.object.isFolder
		));

		setDirs(entries.filter((_, index) => types[index]));
		setFiles(entries.filter((_, index) => !types[index]));
		setLoading(false);
	}, [path]);

	useEffect(() => {
		void loadFiles();
	}, [loadFiles]);

	useEffect(() => {
		if(startPath === path)
		{
			box.current?.focus();
		}
	}, [path, startPath]);

	const newFileKeyUp = async event => {
		if(event.key === 'Enter')
		{
			if(event.target.value)
			{
				const newName = path + '/' + event.target.value;
				const bus = await getPhpBus();
				await bus.writeFile(newName, new TextEncoder().encode(''));
				await loadFiles();
				await onOpenFile(newName);
			}

			setShowNewFile(false);
			event.target.value = '';
		}

		if(event.key === 'Escape')
		{
			setShowNewFile(false);
			event.target.value = '';
		}
	};

	const newFolderKeyUp = async event => {
		if(event.key === 'Enter')
		{
			if(event.target.value)
			{
				const newName = path + '/' + event.target.value;
				const bus = await getPhpBus();
				await bus.mkdir(newName);
				await loadFiles();
			}

			setShowNewFolder(false);
			event.target.value = '';
		}

		if(event.key === 'Escape')
		{
			setShowNewFolder(false);
			event.target.value = '';
		}
	};

	const toggleExpanded = event => {
		event.stopPropagation();
		setExpanded(expanded => {
			pathStates.current.set(path, !expanded);
			return !expanded;
		});
	};

	return (
		<div className = "editor-entry editor-folder">
			<p onClick = {toggleExpanded} onContextMenu={onContext} onBlur = {onBlur} tabIndex="0" ref = {box}>
				<img className = "file icon" src = {
					!loading
						? (expanded ? folderOpen : folderClose)
						: loader
				} alt = "" />
				{name}
			</p>
			{showContext && <span className = "contents only-focus">
				<p className = "context" onClick = {() => setShowNewFile(true)}>
					<img className = "file icon" src = {fileIcon} alt = "" />
					Create New File...
				</p>
				<p className = "context" onClick = {() => setShowNewFolder(true)}>
					<img className = "file icon" src = {folderClose} alt = "" />
					Create New Folder...
				</p>
			</span>}
			{showNewFile && <p className = "context">
				<img className = "file icon" src = {fileIcon} alt = "" />
				<input placeholder='filename' onKeyUp = {newFileKeyUp} autoFocus={true} />
			</p>}
			{showNewFolder && <p className = "context">
				<img className = "file icon" src = {folderClose} alt = "" />
				<input placeholder='filename' onKeyUp = {newFolderKeyUp} autoFocus={true} />
			</p>}
			{expanded && dirs.map(dir =>
				<div key = {dir}>
					<EditorFolder
						name = {dir}
						onOpenFile = {onOpenFile}
						path = {path + (path[path.length - 1] !== '/' ? '/' : '') + dir}
						pathStates = {pathStates}
						startPath = {startPath}
					/>
				</div>
			)}
			{expanded && files.map(file =>
				<div key = {file}>
					<EditorFile
						name = {file}
						onOpenFile = {onOpenFile}
						path = {path + (path[path.length - 1] !== '/' ? '/' : '') + file}
						startPath = {startPath}
					/>
				</div>
			)}
		</div>
	);
}
