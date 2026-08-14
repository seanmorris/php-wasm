/**
 * Vite configuration for bundling the CGI service worker separately from the app shell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerEntry = path.resolve(__dirname, 'src/workers/cgi-worker.mjs');
const workerSourceRoot = path.resolve(__dirname, 'src');
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
			input: workerEntry
			, preserveEntrySignatures: 'strict'
			, output: {
				format: 'es'
				, preserveModules: true
				, preserveModulesRoot: workerSourceRoot
				// Keep the service worker registration URL stable, but hash every
				// other preserved module so browsers cannot stitch together a stale
				// worker graph across deploys.
				, entryFileNames: chunk => chunk.facadeModuleId === workerEntry
					? 'cgi-worker.js'
					: '[name]-[hash].js'
				, chunkFileNames: '[name]-[hash].js'
				, assetFileNames: '[name]-[hash][extname]'
			}
		}
	}
});
