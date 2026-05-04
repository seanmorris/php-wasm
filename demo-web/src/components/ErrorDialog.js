import '../styles/Confirm.css';

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
