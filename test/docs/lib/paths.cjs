const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const docsFixtureRoot = path.join(repoRoot, 'test/docs/fixtures/php-wasm-site');
const docsRoot = path.join(docsFixtureRoot, 'pages');
const sourceRoot = path.join(repoRoot, 'source');
const builderScript = path.join(repoRoot, 'bin/php-wasm-builder.js');
const phpWasmPackageDir = path.join(repoRoot, 'packages/php-wasm');
const phpWasmSiteRoot = process.env.PHP_WASM_SITE_DIR
	? path.resolve(process.env.PHP_WASM_SITE_DIR)
	: '/projects/php-wasm-site';
const phpWasmSiteDocsRoot = path.join(phpWasmSiteRoot, 'pages');

module.exports = {
	builderScript,
	docsFixtureRoot,
	docsRoot,
	phpWasmPackageDir,
	phpWasmSiteDocsRoot,
	phpWasmSiteRoot,
	repoRoot,
	sourceRoot,
};
