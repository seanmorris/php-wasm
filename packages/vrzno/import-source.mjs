import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Make runs these commands from the php-wasm-builder workspace.
const { runSourceImporter } = await import(pathToFileURL(path.resolve('bin/source-importer.mjs')));

await runSourceImporter({
	name: 'vrzno'
	, extension: 'vrzno'
	, prefix: 'VRZNO'
	, label: 'Vrzno'
	, inputs: String.raw`^(?:.+\.(?:c|h)|.+\.h\.in|(?:vrzno_[a-z_]+|php_stream_fetch_real_open)\.js|vrzno_(?:weakermap|bundle)\.mjs|package(?:-lock)?\.json|.+\.stub\.php|Makefile\.frag|config\.m4|CREDITS|LICENSE|NOTICE)$`
	, required: ['vrzno.c', 'config.m4']
});
