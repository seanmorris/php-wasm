/**
 * Temporary path prompt for loading and saving SQL in the demo filesystem.
 */
import {useEffect, useId, useRef, useState} from 'react';
import '../styles/Confirm.css';

export default function QuerySqlFileDialog({mode, initialPath, onConfirm, onCancel})
{
	const [path, setPath] = useState(initialPath ?? '/persist/query.sql');
	const [error, setError] = useState('');
	const input = useRef(null);
	const cancel = useRef(null);
	const id = useId();
	const action = mode === 'save' ? 'Save' : 'Load';

	useEffect(() => {
		const previousFocus = document.activeElement;
		input.current?.focus();
		input.current?.select();
		return () => {
			if(previousFocus?.isConnected)
			{
				previousFocus.focus();
			}
		};
	}, []);

	const submit = event => {
		event.preventDefault();
		if(!path.startsWith('/persist/') || !path.endsWith('.sql') || path.includes('\0') || path.split('/').some(part => part === '.' || part === '..'))
		{
			setError('Choose a .sql file inside /persist/ (its parent folder must already exist).');
			input.current?.focus();
			return;
		}
		onConfirm(path);
	};

	const handleKey = event => {
		if(event.key === 'Escape')
		{
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		}
		else if(event.key === 'Tab' && event.shiftKey && document.activeElement === input.current)
		{
			event.preventDefault();
			cancel.current?.focus();
		}
		else if(event.key === 'Tab' && !event.shiftKey && document.activeElement === cancel.current)
		{
			event.preventDefault();
			input.current?.focus();
		}
	};

	return (
		<div className="Confirm" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={handleKey}>
			<form className="dialog bevel column query-sql-file-dialog" onSubmit={submit}>
				<h2 id={`${id}-title`}>{action} SQL</h2>
				<label htmlFor={`${id}-path`}>SQL file path</label>
				<input
					ref={input}
					id={`${id}-path`}
					type="text"
					value={path}
					autoComplete="off"
					spellCheck={false}
					aria-invalid={Boolean(error)}
					aria-describedby={error ? `${id}-error` : undefined}
					onChange={event => {setPath(event.target.value); setError('');}}
				/>
				{error && <p id={`${id}-error`} role="alert">{error}</p>}
				<div className="right">
					<button className="padded" type="submit">{action}</button>
					<button ref={cancel} className="padded" type="button" onClick={onCancel}>Cancel</button>
				</div>
			</form>
		</div>
	);
}
