import {useCallback, useEffect, useRef, useState} from 'react';
import '../styles/Confirm.css';

/** A promise-based, focus-managed choice or path prompt for editor commands. */
export const useEditorDialog = () => {
	const [dialog, setDialog] = useState(null);
	const pending = useRef(null);
	const ask = useCallback(options => new Promise(resolve => {
		pending.current?.({action: 'cancel'});
		pending.current = resolve;
		setDialog({...options, key: crypto.randomUUID()});
	}), []);
	const finish = useCallback(result => {
		pending.current?.(result);
		pending.current = null;
		setDialog(null);
	}, []);
	useEffect(() => () => pending.current?.({action: 'cancel'}), []);
	return {ask, dialog, finish};
};

/** Render choices with Escape, focus trapping, and validation before submission. */
export default function EditorDialog({dialog, finish})
{
	const form = useRef(null);
	const [value, setValue] = useState(dialog.value ?? '');
	const [error, setError] = useState('');
	useEffect(() => {
		const previous = document.activeElement;
		const target = form.current.querySelector('input:not(:disabled), button:not(:disabled)');
		target?.focus();
		target?.select?.();
		return () => previous?.isConnected && previous.focus();
	}, []);
	const choose = action => {
		if(dialog.choices.find(choice => choice.action === action)?.disabled) return;
		if(action !== 'cancel' && dialog.validate)
		{
			try
			{
				dialog.validate(value);

			}
			catch(failure)
			{
				setError(failure.message);
				return;

			}
		}
		finish({action, value});
	};
	const handleKey = event => {
		event.stopPropagation();
		if(event.key === 'Escape')
		{
			event.preventDefault();
			finish({action: 'cancel'});
		}
		if(event.key !== 'Tab') return;
		const controls = [...form.current.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
		const next = event.shiftKey ? controls.at(-1) : controls[0];
		const edge = event.shiftKey ? controls[0] : controls.at(-1);
		if(document.activeElement === edge)
		{
			event.preventDefault();
			next.focus();
		}
	};
	return <div className="Confirm editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-dialog-title" onKeyDown={handleKey}>
		<form ref={form} className="dialog bevel column padded" onSubmit={event => {
			event.preventDefault();
			choose(dialog.choices.find(choice => !choice.disabled)?.action);
		}}>
			<h2 id="editor-dialog-title">{dialog.title}</h2>
			{dialog.message && <p>{dialog.message}</p>}
			{dialog.label && <label>{dialog.label}<input value={value} onChange={event => {
				setValue(event.target.value);
				setError('');
			}} aria-invalid={!!error} aria-describedby={error ? 'editor-dialog-error' : undefined} spellCheck={false} /></label>}
			{error && <p role="alert" id="editor-dialog-error">{error}</p>}
			<div className="editor-dialog-choices">{dialog.choices.map(choice => <button type="button" key={choice.action} disabled={choice.disabled} onClick={() => choose(choice.action)}>{choice.label}</button>)}</div>
		</form>
	</div>;
}
