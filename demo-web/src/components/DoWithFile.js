/**
 * File-picker confirmation dialog used by restore flows and similar operations.
 */
import { useRef } from 'react';
import '../styles/Confirm.css';

/**
 * Renders a modal that lets the user choose a file before continuing.
 */
export default function DoWithFile({message, onConfirm, onCancel})
{
	const fileInput = useRef(null);

	return (
		<div className="Confirm">
			<div className="dialog bevel column padded">
				<span className='inset padded column'>{message}
					<input type = "file" ref = {fileInput} />
				</span>
				<div className="right">
					<button className='padded' onClick = {() => onConfirm(fileInput.current)}>Continue</button>
					<button className='padded' onClick = {onCancel}>Cancel</button>
				</div>
			</div>
		</div>
	);
}
