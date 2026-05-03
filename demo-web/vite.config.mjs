import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appBase = '/php-wasm/';

const htmlEntryPaths = [
	'/'
	, '/index.html'
	, '/home.html'
	, '/embedded-php.html'
	, '/dbg-preview.html'
	, '/cli-preview.html'
	, '/install-demo.html'
	, '/select-framework.html'
	, '/code-editor.html'
	, '/vscode.html'
];

const localPhpPackages = [
	'@electric-sql/pglite'
	, 'pdo-pglite'
	, 'php-cgi-wasm'
	, 'php-cli-wasm'
	, 'php-dbg-wasm'
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
	, 'php-wasm-sdl'
	, 'php-wasm-simplexml'
	, 'php-wasm-sqlite'
	, 'php-wasm-tidy'
	, 'php-wasm-xml'
	, 'php-wasm-yaml'
	, 'php-wasm-zlib'
];

const trimmedAppBase = appBase.endsWith('/')
	? appBase.slice(0, -1)
	: appBase;

const rootHtmlPath = path.resolve(__dirname, 'src/index.html');

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
		preserveSymlinks: true
	}
	, publicDir: 'public'
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
}));
