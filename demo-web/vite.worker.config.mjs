/**
 * Vite configuration for bundling the CGI service worker separately from the app shell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

export default defineConfig({
	define: {
		__DEMO_LIB_TYPE__: JSON.stringify(libType),
		__DEMO_BUILD_TYPE__: JSON.stringify(libType)
	}
	, assetsInclude: ['**/*.dat', '**/*.so', '**/*.wasm']
	, resolve: {
		alias: {
			'demo-web-shared-support-libs': sharedSupportLibsPath
		}
		, preserveSymlinks: true
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
