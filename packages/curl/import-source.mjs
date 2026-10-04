import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Make runs these commands from the php-wasm-builder workspace.
const { runSourceImporter } = await import(pathToFileURL(path.resolve('bin/source-importer.mjs')));

// php-wasm-curl is a C library (libcurl over fetch), not a PHP extension: only the stage command is
// used. PHP's own ext/curl is built against it.
await runSourceImporter({
	name: 'php-wasm-curl'
	, extension: 'curl'
	, prefix: 'CURL'
	, label: 'php-wasm-curl'
	, inputs: String.raw`^(?:Makefile|libcurl\.pc\.in|include/curl/[a-z_-]+\.h|src/[a-z_]+\.(?:c|h)|README\.md|NOTICE|COPYING\.curl|LICENSE(?:-GPL)?)$`
	, directories: ['include/curl', 'src']
	, required: ['Makefile', 'libcurl.pc.in', 'include/curl/curl.h', 'src/easy.c']
});
