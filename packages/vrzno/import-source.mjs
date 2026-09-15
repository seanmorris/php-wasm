import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Make runs these commands from the php-wasm-builder workspace.
const { runSourceImporter } = await import(pathToFileURL(path.resolve('bin/source-importer.mjs')));

await runSourceImporter({
	name: 'vrzno'
	, extension: 'vrzno'
	, prefix: 'VRZNO'
	, label: 'Vrzno'
	, inputs: String.raw`^(?:.+\.(?:c|h)|.+\.stub\.php|config\.m4|CREDITS|LICENSE)$`
	, required: ['vrzno.c', 'config.m4']
});
