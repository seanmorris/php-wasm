import '../styles/Common.css';
import '../styles/Home.css';
import phpPageIcon from '../assets/frameworks/deepin-php-icon.svg';
import cakePhpIcon from '../assets/frameworks/cakephp-icon.svg';
import drupalIcon from '../assets/frameworks/drupal-icon.svg';
import codeIgniterIcon from '../assets/frameworks/codeigniter-icon.svg';
import laravelIcon from '../assets/frameworks/laravel-icon.svg';
import laminasIcon from '../assets/frameworks/laminas-icon.svg';
import reactIcon from '../assets/frameworks/react-icon.svg';

// import rolodexIcon from '../assets/icons/rolodex-icon-32.png';
import editorIcon from '../assets/icons/editor-icon-32.png';
import vscodeIcon from '../assets/icons/vscode-32.png';
import donateIcon from '../assets/icons/donate-icon-32.png';
import githubIcon from '../assets/icons/github-icon-32.png';
import seanIcon from '../assets/icons/sean-icon-32.png';

import sunburstIcon from '../assets/icons/sunburst.png';
import netscapeIcon from '../assets/icons/netscape.png';
import mouseIcon from '../assets/icons/mouse.png';
import cmdIcon from '../assets/icons/cmd-icon-32.png';
import downIcon from '../assets/icons/down.png';
import upIcon from '../assets/icons/up.png';

import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { basePath } from '../lib/runtimePaths';

function Home()
{
	const [offset, setOffset] = useState(Math.trunc(Math.random() * 5));
	const [scrollState, setScrollState] = useState(1);
	const [showMore, setShowMore] = useState(false);

	const query = useMemo(() => new URLSearchParams(window.location.search), []);

	useEffect(() => {
		if(query.has('code') || query.has('demo'))
		{
			window.location = basePath(`embedded-php.html${window.location.search}`);
		}
	}, [query]);

	useEffect(() => {
		const speed = 1400;
		setTimeout(() => {
			if(offset >= 5)
			{
				setTimeout(() => {
					setScrollState(0);
					setOffset(0);
					setTimeout(() => {
						setScrollState(1);
						setOffset(1);
					}, 32);
				}, 16);
			}
			else
			{
				setScrollState(1);
				setOffset((offset + 1) % 6);
			}
		}, speed);

	}, [offset, scrollState]);

	return (
		<div className = "home">
			<div className='home-menu bevel'>
				<Header />
				<h2>Select a demo:</h2>
				<div className='row'>
					<a className = "big-link inset" href = {basePath('embedded-php.html?demo=sdl-sine.php')}>
						<div className = "big-icon embedded">
							<img alt = "page showing php logo" src = {phpPageIcon} />
						</div>
						<span className = "title">PHP Embedded Demo</span>
						<p className='padded'>View, edit & run PHP code right in the browser.</p>
					</a>
					<a className = "big-link inset" href = {basePath('select-framework.html')}>
						<div className = "big-icon cgi" style={{'--offset': offset}} data-scroll-state = {scrollState}>
							<div className = "offset-column">
								<img src = {cakePhpIcon} alt = "CakePHP logo" />
								<img src = {codeIgniterIcon} alt = "CodeIgniter logo" />
								<img src = {drupalIcon} alt = "Drupal logo" />
								<img src = {laminasIcon} alt = "Laminas logo" />
								<img src = {laravelIcon} alt = "Laravel logo" />
								<img src = {cakePhpIcon} alt = "CakePHP logo" />
							</div>
						</div>
						<span className = "title">PHP CGI Demo</span>
						<p className='padded'>Spin up a CGI service worker and serve a demo from the framework of your choice.</p>
					</a>
				</div>

				<div className = "inset button-bar">
					<div className = "row">
						<button onClick = {() => window.location = basePath('code-editor.html')}>
							<img src = {editorIcon} className = "icon" alt = "Code Editor" />
							Lightweight Code Editor
						</button>
						<button onClick = {() => window.location = basePath('vscode.html')}>
							<img src = {vscodeIcon} className = "icon" alt = "Code Editor" />
							VSCode
						</button>
						{/* <button>
							<img src = {rolodexIcon} className = "icon" alt = "SQL Editor" />
							SQL Editor
						</button> */}
					</div>
					<div>
						<button onClick = {() => window.open('https://github.com/seanmorris/php-wasm?tab=readme-ov-file#-php-wasm')}>
							<img src = {githubIcon} className = "icon" alt = "Github" />
							Github
						</button>
						<button onClick = {() => window.open('https://github.com/sponsors/seanmorris')}>
							<img src = {donateIcon} className = "icon" alt = "Donate" />
							Donate
						</button>
						<button onClick = {() => window.open('https://seanmorr.is')}>
							<img src = {seanIcon} alt = "sean" />
							Sean Morris
						</button>
					</div>
				</div>

				<h3><button onClick = { () => {setShowMore(!showMore);}} className='square'><img src = {showMore ? upIcon : downIcon} alt = "" /></button><span onClick = { () => {setShowMore(!showMore);}}>More...</span></h3>
				{ showMore && ( <div className = "inset extra-demos">
					<a target = "_blank" href = {basePath('cli-preview.html')} className="icon-box" rel="noreferrer">
						<img src = {cmdIcon} alt = "PHP-CLI Preview" />
						<span>PHP-CLI Preview</span>
					</a>

					<a target = "_blank" href = {basePath('forecast.html')} className="icon-box" rel="noreferrer">
						<img src = {sunburstIcon} alt = "Inline FrontEnd PHP" />
						<span>Inline FrontEnd PHP</span>
					</a>

					<a target = "_blank" href = "https://github.com/seanmorris/php-gtk" className="icon-box" rel="noreferrer">
						<img src = {netscapeIcon} alt = "GTK PHP+Node Browser" />
						<span>GTK PHP+Node Browser</span>
					</a>

					<a target = "_blank" href = "https://codepen.io/SeanMorris227/pen/NWoGMYp?editors=1010" className="icon-box" rel="noreferrer">
						<img src = {mouseIcon} alt = "PHP Event Handlers" />
						<span>PHP Event Handlers</span>
					</a>

					{/* <a target = "_blank" href = "https://php-cloud.pages.dev/" className="icon-box">
						<img src = {dbIcon} alt = "CloudFlare D1 SQL PDO Connector" />
						<span>CloudFlare D1 SQL PDO Connector</span>
					</a> */}
				</div> ) }

				<div className = "inset right demo-bar">
					<span>Demo powered by React</span> <img alt = "react-logo" src = {reactIcon} className='small-icon'/>
				</div>
			</div>
		</div>
	);
}

export default Home;
