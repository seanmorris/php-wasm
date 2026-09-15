import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Make runs these commands from the php-wasm-builder workspace.
const { runSourceImporter } = await import(pathToFileURL(path.resolve('bin/source-importer.mjs')));

await runSourceImporter({
	name: 'waitline'
	, extension: 'waitline'
	, prefix: 'WAITLINE'
	, label: 'Waitline'
	, inputs: String.raw`^(?:.+\.(?:c|h)|.+\.stub\.php|config\.(?:m4|w32)|README\.md|CREDITS|LICENSE)$`
	, required: ['waitline.c', 'config.m4']
});
