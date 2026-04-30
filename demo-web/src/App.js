import { Navigate, Route, Routes } from 'react-router';
import { BrowserRouter } from 'react-router-dom';

import CliPreview from './CliPreview';
import DbgPreview from './DbgPreview';
import Editor from './Editor';
import Embedded from './Embedded';
import Home from './Home';
import InstallDemo from './InstallDemo';
import MultiIframeTest from './MultiIframeTest';
import SelectFramework from './SelectFramework';
import VSCodeEditor from './VSCodeEditor';
import { basePath, routerBase } from './runtimePaths';

export function AppRoutes() {
	return <Routes>
		<Route path = "/" element = { <Home /> } />
		<Route path = "/home.html" element = { <Home /> } />
		<Route path = "/embedded-php.html" element = { <Embedded /> } />
		<Route path = "/dbg-preview.html" element = { <DbgPreview /> } />
		<Route path = "/cli-preview.html" element = { <CliPreview /> } />
		<Route path = "/select-framework.html" element = { <SelectFramework /> } />
		<Route path = "/install-demo.html" element = { <InstallDemo /> } />
		<Route path = "/code-editor.html" element = { <Editor /> } />
		<Route
			path = "/code-editor"
			element = { <Navigate to = {basePath(`code-editor.html${window.location.search}`)} />}
		/>
		<Route
			path = "/php-wasm/code-editor"
			element = { <Navigate to = {basePath(`code-editor.html${window.location.search}`)} />}
		/>
		<Route
			path = "/php-wasm/code-editor.html"
			element = { <Navigate to = {basePath(`code-editor.html${window.location.search}`)} />}
		/>
		<Route
			path = "/cgi-bin/drupal"
			element = { <Navigate to = {basePath('install-demo.html?framework=drupal-7')} />}
		/>
		<Route
			path = "/php-wasm/cgi-bin/drupal"
			element = { <Navigate to = {basePath('install-demo.html?framework=drupal-7')} />}
		/>
		<Route
			path = "/cgi-bin/cakephp-5"
			element = { <Navigate to = {basePath('install-demo.html?framework=cakephp-5')} />}
		/>
		<Route
			path = "/php-wasm/cgi-bin/cakephp-5"
			element = { <Navigate to = {basePath('install-demo.html?framework=cakephp-5')} />}
		/>
		<Route
			path = "/cgi-bin/codeigniter-4"
			element = { <Navigate to = {basePath('install-demo.html?framework=codeigniter-4')} />}
		/>
		<Route
			path = "/php-wasm/cgi-bin/codeigniter-4"
			element = { <Navigate to = {basePath('install-demo.html?framework=codeigniter-4')} />}
		/>
		<Route
			path = "/cgi-bin/laminas-3"
			element = { <Navigate to = {basePath('install-demo.html?framework=laminas-3')} />}
		/>
		<Route
			path = "/php-wasm/cgi-bin/laminas-3"
			element = { <Navigate to = {basePath('install-demo.html?framework=laminas-3')} />}
		/>
		<Route
			path = "/cgi-bin/laravel-11"
			element = { <Navigate to = {basePath('install-demo.html?framework=laravel-11')} /> }
		/>
		<Route
			path = "/php-wasm/cgi-bin/laravel-11"
			element = { <Navigate to = {basePath('install-demo.html?framework=laravel-11')} /> }
		/>
		<Route path = "/iframe-test.html" element = { <MultiIframeTest /> } />
		<Route path = "/vscode.html" element = { <VSCodeEditor /> } />
	</Routes>;
}

export default function App() {
	return <BrowserRouter basename = {routerBase}>
		<AppRoutes />
	</BrowserRouter>;
}
