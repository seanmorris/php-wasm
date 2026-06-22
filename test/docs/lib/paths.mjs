import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '../../..');
export const docsFixtureRoot = path.join(repoRoot, 'test/docs/fixtures/php-wasm-site');
export const docsRoot = path.join(docsFixtureRoot, 'pages');
export const sourceRoot = path.join(repoRoot, 'source');
export const builderScript = path.join(repoRoot, 'bin/php-wasm-builder.js');
export const phpWasmPackageDir = path.join(repoRoot, 'packages/php-wasm');
export const phpWasmSiteRoot = process.env.PHP_WASM_SITE_DIR
	? path.resolve(process.env.PHP_WASM_SITE_DIR)
	: '/projects/php-wasm-site';
export const phpWasmSiteDocsRoot = path.join(phpWasmSiteRoot, 'pages');
