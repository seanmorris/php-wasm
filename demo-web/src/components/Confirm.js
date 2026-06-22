/**
 * Modal confirmation prompt used by destructive or long-running demo actions.
 */
import '../styles/Confirm.css';

/**
 * Renders a confirm/cancel dialog with caller-provided content.
 */
export default function Confirm({message, onConfirm, onCancel})
{
	return (
		<div className="Confirm">
			<div className="dialog bevel column">
				<span className='inset padded'>{message}</span>
				<div className="right">
					<button className='padded' onClick = {onConfirm}>Confirm</button>
					<button className='padded' onClick = {onCancel}>Cancel</button>
				</div>
			</div>
		</div>
	);
}
