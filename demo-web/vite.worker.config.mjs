/**
 * Vite configuration for bundling the CGI service worker separately from the app shell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	assetsInclude: ['**/*.dat', '**/*.so', '**/*.wasm']
	, resolve: {
		preserveSymlinks: true
	}
	, publicDir: false
	, base: '/php-wasm/'
	, build: {
		modulePreload: false
		, copyPublicDir: false
		, emptyOutDir: false
		, outDir: 'public'
		, target: 'esnext'
		, sourcemap: true
		, rollupOptions: {
			input: path.resolve(__dirname, 'src/workers/cgi-worker.mjs')
			, output: {
				format: 'es'
				, entryFileNames: 'cgi-worker.js'
				, inlineDynamicImports: true
				, chunkFileNames: '[name]-[hash].js'
				, assetFileNames: '[name]-[hash][extname]'
			}
		}
	}
});
