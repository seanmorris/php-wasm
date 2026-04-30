import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	assetsInclude: ['**/*.dat', '**/*.so', '**/*.wasm']
	, publicDir: false
	, build: {
		modulePreload: false
		, copyPublicDir: false
		, emptyOutDir: false
		, outDir: 'public'
		, target: 'esnext'
		, sourcemap: true
		, rollupOptions: {
			input: path.resolve(__dirname, 'src/cgi-worker.mjs')
			, output: {
				format: 'es'
				, entryFileNames: 'cgi-worker.js'
				, inlineDynamicImports: true
				, chunkFileNames: 'worker-assets/[name]-[hash].js'
				, assetFileNames: 'worker-assets/[name]-[hash][extname]'
			}
		}
	}
});
