/**
 * Primary Vite configuration for the demo-web React application.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { patchPhpEditorWorker } from './src/lib/phpEditorWorker.js';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appBase = '/php-wasm/';
const localQuickbusPath = path.resolve(__dirname, '../../projects/quickbus/index.mjs');
const libType = process.env.LIB_TYPE
	|| process.env.VITE_LIB_TYPE
	|| process.env.BUILD_TYPE
	|| process.env.VITE_BUILD_TYPE
	|| 'dynamic';
const sharedSupportLibsPath = path.resolve(
	__dirname
	, libType === 'shared'
		? 'src/lib/sharedSupportLibs.js'
		: 'src/lib/sharedSupportLibs.stub.js'
);

const htmlEntryPaths = [
	'/'
	, '/index.html'
	, '/home.html'
	, '/embedded-php.html'
	, '/dbg-preview.html'
	, '/cli-preview.html'
	, '/waitline-preview.html'
	, '/install-demo.html'
	, '/select-framework.html'
	, '/code-editor.html'
	, '/query-workbench.html'
	, '/vscode.html'
];

const localPhpPackages = [
	'@electric-sql/pglite'
	, 'pdo-pglite'
	, 'php-cgi-wasm'
	, 'php-cli-wasm'
	, 'php-dbg-wasm'
	, 'php-sdl-wasm'
	, 'php-wasm'
	, 'php-wasm-dom'
	, 'php-wasm-gd'
	, 'php-wasm-iconv'
	, 'php-wasm-intl'
	, 'php-wasm-libxml'
	, 'php-wasm-libzip'
	, 'php-wasm-mbstring'
	, 'php-wasm-openssl'
	, 'php-wasm-phar'
	, 'php-wasm-simplexml'
	, 'php-wasm-sqlite'
	, 'php-wasm-tidy'
	, 'php-wasm-xml'
	, 'php-wasm-xmlreader'
	, 'php-wasm-xmlwriter'
	, 'php-wasm-yaml'
	, 'php-wasm-zlib'
	, 'quickbus'
];

const trimmedAppBase = appBase.endsWith('/')
	? appBase.slice(0, -1)
	: appBase;

const rootHtmlPath = path.resolve(__dirname, 'src/index.html');

/** Serve and emit the same checked Ace worker correction without editing node_modules. */
const phpEditorWorkerPlugin = () => {
	const moduleId = '\0php-editor-worker';
	const filename = 'php-editor-worker.js';
	const workerPath = createRequire(import.meta.url).resolve('ace-builds/src-noconflict/worker-php.js');
	let command;
	let source;
	const getSource = () => source ??= fs.readFile(workerPath, 'utf8').then(patchPhpEditorWorker);

	return {
		name: 'php-editor-worker'
		, configResolved(config) { command = config.command; }
		, resolveId(id) { return id === 'php-editor-worker' ? moduleId : null; }
		, async load(id) {
			if(id !== moduleId)
			{
				return null;
			}
			if(command !== 'build')
			{
				return `export default ${JSON.stringify(appBase + filename)};`;
			}
			const reference = this.emitFile({type: 'asset', name: filename, source: await getSource()});
			return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
		}
		, configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if(new URL(req.url, 'http://localhost').pathname !== appBase + filename)
				{
					next();
					return;
				}
				try
				{
					res.setHeader('content-type', 'application/javascript');
					res.setHeader('cache-control', 'no-cache');
					res.end(await getSource());
				}
				catch(error)
				{
					next(error);
				}
			});
		}
	};
};

/**
 * Serves every legacy HTML alias through the same transformed Vite entry document.
 */
const legacyHtmlAliasPlugin = () => ({
	name: 'legacy-html-alias-plugin'
	, configureServer(server) {
		server.middlewares.use(async (req, res, next) => {
			const method = req.method ?? 'GET';
			const url = req.url ? new URL(req.url, 'http://localhost') : null;
			const normalizedPath = !url
				? null
				: (url.pathname === trimmedAppBase || url.pathname.startsWith(`${trimmedAppBase}/`))
					? url.pathname.slice(trimmedAppBase.length) || '/'
					: url.pathname;

			if(!url || (method !== 'GET' && method !== 'HEAD') || !normalizedPath || !htmlEntryPaths.includes(normalizedPath))
			{
				next();
				return;
			}

			try
			{
				const html = await fs.readFile(rootHtmlPath, 'utf8');
				const transformed = await server.transformIndexHtml(normalizedPath, html, req.originalUrl);

				res.statusCode = 200;
				res.setHeader('content-type', 'text/html; charset=utf-8');
				res.end(method === 'HEAD' ? '' : transformed);
			}
			catch(error)
			{
				next(error);
			}
		});
	}
});

export default defineConfig(() => ({
	plugins: [
		react({include: /\.[jt]sx?$/})
		, legacyHtmlAliasPlugin()
		, phpEditorWorkerPlugin()
	]
	, assetsInclude: ['**/*.dat', '**/*.so', '**/*.wasm']
	, base: appBase
	, oxc: false
	, esbuild: {
		loader: 'jsx'
		, include: /src\/.*\.js$/
		, exclude: []
	}
	, optimizeDeps: {
		exclude: localPhpPackages
		, esbuildOptions: {
			loader: {
				'.js': 'jsx'
			}
		}
	}
	, define: {
		'import.meta.env.VITE_PHP_VERSION': JSON.stringify(process.env.PHP_VERSION ?? '8.4')
	}
	, resolve: {
		alias: {
			'demo-web-shared-support-libs': sharedSupportLibsPath
			, ...(existsSync(localQuickbusPath)
				? { quickbus: localQuickbusPath }
				: {})
		}
		, preserveSymlinks: true
	}
	, publicDir: 'public'
	, worker: {format: 'es'}
	, build: {
		outDir: 'build'
		, sourcemap: false
		, rollupOptions: {
			input: {
				index: rootHtmlPath
			}
		}
	}
	, test: {
		environment: 'jsdom'
		, globals: true
		, setupFiles: './src/setupTests.js'
	}
	, server: { allowedHosts: ['php-wasm-tunnel.seanmorr.is'] }
}));
