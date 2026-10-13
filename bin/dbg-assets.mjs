#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function requiredLibraries(bytes) {
	const module = new WebAssembly.Module(bytes);
	const section = WebAssembly.Module.customSections(module, 'dylink.0')[0];
	if(!section) return [];
	const data = new Uint8Array(section); let offset = 0;
	const leb = () => {let value = 0, shift = 0, byte; do {if(offset >= data.length || shift > 28) throw new Error('Invalid dylink metadata'); byte = data[offset++]; value += (byte & 127) * 2 ** shift; shift += 7;} while(byte & 128); return value;};
	while(offset < data.length) {
		const type = data[offset++], size = leb(), end = offset + size;
		if(end > data.length) throw new Error('Truncated dylink metadata');
		if(type === 2) {
			const count = leb(), libraries = [];
			for(let i = 0; i < count; i++) {const length = leb(); libraries.push(new TextDecoder().decode(data.slice(offset, offset + length))); offset += length;}
			if(offset !== end) throw new Error('Invalid dependency metadata');
			return libraries;
		}
		offset = end;
	}
	return [];
}

export async function writeDbgManifest(filename) {
	const source = await fs.readFile(filename, 'utf8');
	const match = path.basename(filename).match(/^php(8\.[0-5])-dbg-(web|worker)\.(m?js)$/);
	if(!match) throw new Error(`Unsupported debugger artifact: ${filename}`);
	const wasm = source.match(/[0-9a-f]{40,64}\.wasm/)?.[0] ?? source.match(/['"]([^'"]+\.wasm)['"]/)?.[1];
	if(!wasm) throw new Error(`No WASM asset in ${filename}`);
	const bytes = await fs.readFile(path.join(path.dirname(filename), wasm));
	const data = [...new Set([...source.matchAll(/(?:REMOTE_PACKAGE_BASE\s*=\s*|new URL\()['"]([^'"]+\.data)['"]/g)].map(m => m[1]))];
	const manifest = {schemaVersion: 1, bridgeVersion: 1, version: match[1], environment: match[2], loader: path.basename(filename), wasm,
		sha256: createHash('sha256').update(bytes).digest('hex'), data, libraries: requiredLibraries(bytes)};
	await fs.writeFile(filename + '.assets.json', JSON.stringify(manifest, null, 2) + '\n');
	return manifest;
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writeDbgManifest(process.argv[2]);
