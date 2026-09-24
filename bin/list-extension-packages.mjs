#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const require = createRequire(path.join(root, 'package.json'));
const runtimes = new Set(['php-wasm', 'php-cloud-wasm', 'php-cgi-wasm', 'php-cli-wasm', 'php-dbg-wasm']);
const directories = new Set();

// Local build templates ship with the builder; npm may hoist other dependencies.
// Resolve from this package instead of treating its directory as an npm project.
for(const [name, specifier] of Object.entries(metadata.dependencies ?? {}))
{
	if(runtimes.has(name)) continue;
	let directory;
	const local = specifier.replace(/^file:/, '');
	if(local.startsWith('./') && fs.existsSync(path.resolve(root, local, 'package.json')))
	{
		directory = path.resolve(root, local);
	}
	else
	{
		try { directory = path.dirname(require.resolve(`${name}/package.json`)); }
		catch { continue; }
	}
	if(fs.existsSync(path.join(directory, 'pre.mak')) || fs.existsSync(path.join(directory, 'static.mak')))
	{
		directories.add(directory);
	}
}
console.log([...directories].join(' '));
