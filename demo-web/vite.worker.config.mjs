/**
 * Vite configuration for bundling the CGI service worker separately from the app shell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedSupportLibsPath = path.resolve(
	__dirname
	, process.env.BUILD_TYPE === 'shared'
		? 'src/lib/sharedSupportLibs.js'
		: 'src/lib/sharedSupportLibs.stub.js'
);

export default defineConfig({
	assetsInclude: ['**/*.dat', '**/*.so', '**/*.wasm']
	, resolve: {
		alias: {
			'demo-web-shared-support-libs': sharedSupportLibsPath
		},
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
				, preserveEntrySignatures: 'strict'
				, output: {
					format: 'es'
					, entryFileNames: 'cgi-worker.js'
					, preserveModules: true
					, preserveModulesRoot: __dirname
					, chunkFileNames: '[name]-[hash].js'
					, assetFileNames: '[name]-[hash][extname]'
				}
			}
	}
});
