import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Make runs these commands from the php-wasm-builder workspace.
const { runSourceImporter } = await import(pathToFileURL(path.resolve('bin/source-importer.mjs')));

await runSourceImporter({
	name: 'pdo-pglite'
	, extension: 'pdo_pglite'
	, prefix: 'PDO_PGLITE'
	, label: 'PGlite'
	, inputs: String.raw`^(?:.+\.(?:c|h)|config\.(?:m4|w32)|README\.md|CREDITS|LICENSE)$`
	, required: ['pdo_pglite.c', 'config.m4']
});
