import { basePath } from '../lib/runtimePaths';

export default function Header()
{
	return (<div className = "row header toolbar">
		<div className = "cols">
			<div className = "row start">
				<a href = { basePath() }>
					<img src = "sean-icon.png" alt = "sean" />
				</a>
				<a href = { basePath() }><h1>php-wasm</h1></a>
				<hr />
			</div>
		</div>
		<div className = "separator">
		</div>
	</div>);
};
