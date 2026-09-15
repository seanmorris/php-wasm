import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Make runs these commands from the php-wasm-builder workspace.
const { runSourceImporter } = await import(pathToFileURL(path.resolve('bin/source-importer.mjs')));

await runSourceImporter({
	name: 'pdo-cfd1'
	, extension: 'pdo_cfd1'
	, prefix: 'PDO_CFD1'
	, label: 'CFD1'
	, inputs: String.raw`^(?:.+\.(?:c|h)|pdo_cfd1_[a-z_]+\.js|pdo_cfd1_js\.h\.in|Makefile\.frag|config\.(?:m4|w32)|README\.md|CREDITS|LICENSE)$`
	, required: ['pdo_cfd1.c', 'config.m4']
	, legacyPatchIdentity: true
});
