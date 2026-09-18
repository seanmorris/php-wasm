import {useEffect, useRef, useState} from 'react';
import {editorFilesystem} from '../lib/editorFilesystem';
import {withinPath} from '../lib/editorPaths';

/** Search filenames below the selected root without blocking editor rendering. */
export default function EditorQuickOpen({root, recent, onOpen, onClose})
{
	const [query, setQuery] = useState('');
	const [results, setResults] = useState(recent);
	const [status, setStatus] = useState('Recent files');
	const input = useRef(null);
	const box = useRef(null);
	useEffect(() => {
		const previous = document.activeElement;
		input.current.focus();
		return () => previous?.isConnected && previous.focus();
	}, []);
	useEffect(() => {
		let cancelled = false;
		if(!query.trim())
		{
			setResults(recent);
			setStatus('Recent files');
			return;
		}
		const timer = setTimeout(async () => {
			const found = [];
			const pending = [root];
			let count = 0;
			setResults([]);
			setStatus('Searching…');
			try
			{
				while(pending.length && !cancelled && count < 50000 && found.length < 100)
				{
					const path = pending.shift();
					for(const entry of await editorFilesystem.list(path))
					{
						if(cancelled) return;
						count++;
						if(entry.kind === 'directory' && !withinPath(entry.path, '/dev') && !withinPath(entry.path, '/proc')) pending.push(entry.path);
						else if(entry.kind === 'file' && entry.path.toLowerCase().includes(query.toLowerCase())) found.push(entry.path);
						if(found.length >= 100 || count >= 50000) break;
					}
					if(!cancelled) setResults([...found]);
				}
				if(!cancelled) setStatus(found.length >= 100 || count >= 50000 ? 'Results limited. Narrow the search or choose a smaller explorer root.' : found.length + ' files found');
			}
			catch(error)
			{
				if(!cancelled) setStatus(error.message || String(error));
			}
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, root, recent]);
	const choose = path => {
		onClose();
		void onOpen(path);
	};
	return <div className="Confirm editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-quick-title" onKeyDown={event => {
		event.stopPropagation();
		if(event.key === 'Escape')
		{
			event.preventDefault();
			onClose();
		}
		if(event.key === 'Tab')
		{
			const controls = [...box.current.querySelectorAll('input, button')];
			const edge = event.shiftKey ? controls[0] : controls.at(-1);
			if(document.activeElement === edge)
			{
				event.preventDefault();
				(event.shiftKey ? controls.at(-1) : controls[0]).focus();
			}
		}
	}}>
		<div ref={box} className="dialog bevel column padded">
			<h2 id="editor-quick-title">Quick open</h2>
			<label>Filename or absolute path<input ref={input} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
				if(event.key === 'Enter' && (query.startsWith('/') || results[0]))
				{
					event.preventDefault();
					choose(query.startsWith('/') ? query : results[0]);
				}
				if(event.key === 'ArrowDown') box.current.querySelector('.editor-quick-results button')?.focus();
			}} /></label>
			<p role="status">{status} — {root}</p>
			<div className="editor-quick-results">{results.map(path => <button key={path} onClick={() => choose(path)}>{path}</button>)}</div>
			<button onClick={onClose}>Close</button>
		</div>
	</div>;
}
