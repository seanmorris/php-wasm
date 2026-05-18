/**
 * Error modal used to surface recoverable UI failures to the user.
 */
import '../styles/Confirm.css';

/**
 * Renders a single-action error dialog with an acknowledgement button.
 */
export default function ErrorDialog({message, onConfirm})
{
	return (
		<div className="Confirm">
			<div className="dialog bevel column padded">
				<span className='inset padded'>
					<h1>Error</h1>
					{message}
				</span>
				<div className="right">
					<button className='padded' onClick = {onConfirm}>OK</button>
				</div>
			</div>
		</div>
	);
}
