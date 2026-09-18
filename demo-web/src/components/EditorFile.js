import fileIcon from '../assets/nomo-dark/file.svg';

/** Stateless file row; filesystem mutations and tab ownership belong to the workspace. */
export default function EditorFile({entry, selected, onSelect, onOpenFile, onMenu, onDrop})
{
	return <li role="none" className="editor-entry editor-file">
		<div role="treeitem" tabIndex={0} aria-selected={selected.has(entry.path)} data-path={entry.path}
			draggable={!entry.protected} onDragStart={event => event.dataTransfer.setData('application/x-php-wasm-paths', JSON.stringify(selected.has(entry.path) ? [...selected] : [entry.path]))}
			onContextMenu={event => {
				event.preventDefault();
				onSelect(entry, false);
				onMenu(entry);
			}}
			onKeyDown={event => {if(event.target !== event.currentTarget) return; if(event.key === 'Enter' && entry.kind === 'file')
			{
				event.preventDefault();
				onOpenFile(entry.path);
			} if(event.key === ' ')
			{
				event.preventDefault();
				onSelect(entry, true);
			}}}
			onDragOver={event => event.preventDefault()} onDrop={event => onDrop(event, entry)}>
			<input type="checkbox" aria-label={`Select ${entry.name}`} checked={selected.has(entry.path)} onChange={() => onSelect(entry, true)} />
			<button className="editor-entry-name" title={entry.path} disabled={entry.kind !== 'file'} onClick={event => {
				onSelect(entry, event.ctrlKey || event.metaKey || event.shiftKey);
				if(!event.ctrlKey && !event.metaKey && !event.shiftKey) onOpenFile(entry.path);
			}}>
				<img className="file icon" src={fileIcon} alt="" />{entry.name}
			</button>
			<button aria-label={`Actions for ${entry.name}`} title="File actions" onClick={() => {
				onSelect(entry, false);
				onMenu(entry);
			}}>⋯</button>
		</div>
	</li>;
}
