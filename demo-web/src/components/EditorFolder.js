import '../styles/EditorEntry.css';
import {useEffect, useId, useState} from 'react';
import EditorFile from './EditorFile';
import folderOpen from '../assets/nomo-dark/folder.open.svg';
import folderClose from '../assets/nomo-dark/folder.close.svg';
import {editorFilesystem} from '../lib/editorFilesystem';

/** Lazily load only expanded folders; rows never own renamed or deleted state. */
export default function EditorFolder({entry, expanded, onExpand, selected, onSelect, onOpenFile, onMenu, onDrop, refresh, filter = ''})
{
	const [entries, setEntries] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [retry, setRetry] = useState(0);
	const groupId = useId();
	const opened = expanded.has(entry.path);
	useEffect(() => {
		if(!opened) return;
		let live = true;
		setLoading(true);
		setError('');
		editorFilesystem.list(entry.path).then(result => {
			if(live) setEntries(result);
		})
			.catch(failure => {
				if(live) setError(failure.message || String(failure));
			})
			.finally(() => {
				if(live) setLoading(false);
			});
		return () => {
			live = false;
		};
	}, [entry.path, opened, refresh, retry]);
	const props = {expanded, onExpand, selected, onSelect, onOpenFile, onMenu, onDrop, refresh, filter};
	return <li role="none" className="editor-entry editor-folder">
		<div role="treeitem" tabIndex={0} aria-expanded={opened} aria-owns={opened ? groupId : undefined} aria-selected={selected.has(entry.path)} data-path={entry.path}
			onContextMenu={event => {
				event.preventDefault();
				onSelect(entry, false);
				onMenu(entry);
			}}
			draggable={!entry.protected} onDragStart={event => event.dataTransfer.setData('application/x-php-wasm-paths', JSON.stringify(selected.has(entry.path) ? [...selected] : [entry.path]))}
			onDragOver={event => event.preventDefault()} onDrop={event => onDrop(event, entry)}
			onKeyDown={event => {
				if(event.target !== event.currentTarget) return;
				if(event.key === 'Enter' || event.key === 'ArrowRight' || event.key === 'ArrowLeft')
				{
					event.preventDefault(); event.stopPropagation();
					onExpand(entry.path, event.key === 'ArrowRight' ? true : event.key === 'ArrowLeft' ? false : !opened);
				}
				if(event.key === ' ')
				{
					event.preventDefault();
					onSelect(entry, true);
				}
			}}>
			<input type="checkbox" aria-label={`Select ${entry.name}`} checked={selected.has(entry.path)} onChange={() => onSelect(entry, true)} />
			<button className="editor-entry-name" title={entry.path} onClick={event => {
				onSelect(entry, event.ctrlKey || event.metaKey);
				if(!event.ctrlKey && !event.metaKey) onExpand(entry.path, !opened);
			}}>
				<img className="file icon" src={opened ? folderOpen : folderClose} alt="" />{entry.name}{loading ? ' …' : ''}
			</button>
			<button aria-label={`Actions for ${entry.name}`} title="Folder actions" onClick={() => {
				onSelect(entry, false);
				onMenu(entry);
			}}>⋯</button>
		</div>
		{error && <div role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
		{opened && <ul role="group" id={groupId}>{entries.filter(child => child.kind === 'directory' || !filter || child.name.toLowerCase().includes(filter.toLowerCase())).map(child => child.kind === 'directory'
			? <EditorFolder key={child.path} entry={child} {...props} />
			: <EditorFile key={child.path} entry={child} {...props} />)}</ul>}
		{opened && !loading && !error && !entries.length && <span className="editor-empty-folder">Empty folder</span>}
	</li>;
}
