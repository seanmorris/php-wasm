/**
 * Top-level router composition for the demo-web application.
 */
import { Navigate, Route, Routes } from 'react-router';
import { BrowserRouter } from 'react-router-dom';

import CliPreview from './pages/CliPreview';
import DbgPreview from './pages/DbgPreview';
import Editor from './pages/Editor';
import Embedded from './pages/Embedded';
import Home from './pages/Home';
import InstallDemo from './pages/InstallDemo';
import MultiIframeTest from './pages/MultiIframeTest';
import SelectFramework from './pages/SelectFramework';
import VSCodeEditor from './pages/VSCodeEditor';
import { basePath, routerBase } from './lib/runtimePaths';

/**
 * Declares the route table used by the demo application.
 */
export function AppRoutes()
{
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

/**
 * Wraps the route table in the browser router configured for the demo base path.
 */
export default function App()
{
	return <BrowserRouter basename = {routerBase}>
		<AppRoutes />
	</BrowserRouter>;
}
