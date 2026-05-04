import '../styles/Confirm.css';

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
