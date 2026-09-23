#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {runtimePackageFiles, digest, contentAddressRuntime, verifyManifest, writeManifest, copyRuntimeSources} from './runtime-package.mjs';
const sha256 = digest;
const versionPattern = /^8\.[0-5]$/;
export const cloudflarePackageFiles = runtimePackageFiles;
export const cloudflareProfile = {
	id: 'cloudflare', name: 'php-cloud-wasm', label: 'Cloudflare', adapter: 'PhpCloudflare.mjs'
	, declarations: ['PhpCloudflare.d.mts', 'PhpBase.d.mts', 'public.d.ts']
	, assetPattern: /^(?:[A-Za-z0-9_.-]+\.(?:mjs|d\.mts|d\.ts)|[a-f0-9]{40}\.wasm)$/
};

export async function verifyCloudflare(root, version, {allowLegacy = false} = {})
{
	const {manifest, manifestName, names} = await verifyManifest(root, version, cloudflareProfile, {allowLegacy});
	const entry = await fs.readFile(path.join(root, manifest.entrypoint), 'utf8');
	const wasmImports = [...entry.matchAll(/from ['"]\.\/([a-f0-9]{40}\.wasm)['"]/g)];
	if(wasmImports.length !== 1 || !names.has(wasmImports[0][1])) throw new Error('Cloudflare adapter must import exactly one manifest-owned Wasm module');
	const wasm = await fs.readFile(path.join(root, wasmImports[0][1]));
	if(!WebAssembly.validate(wasm)) throw new Error('Invalid Cloudflare WebAssembly artifact');
	if(`${createHash('sha1').update(wasm).digest('hex')}.wasm` !== wasmImports[0][1]) throw new Error('Cloudflare Wasm content-address mismatch');
	if(!(await fs.readFile(path.join(root, manifest.runtime), 'utf8')).includes(wasmImports[0][1])) throw new Error('Cloudflare factory does not reference its matched Wasm artifact');
	return {manifest, manifestName};
}

export async function packageCloudflare(root, version, provenance = {})
{
	if(!versionPattern.test(version)) throw new Error(`Unsupported PHP version: ${version}`);
	root = path.resolve(root);
	const runtime = `php${version}-cloudflare-runtime.mjs`;
	const rawWasm = path.join(root, `${runtime}.wasm`);
	try { await fs.access(rawWasm); }
	catch { return (await verifyCloudflare(root, version)).manifest; }
	const wasmName = await contentAddressRuntime(root, runtime, 'Cloudflare');
	return finalizeCloudflare(root, version, wasmName, provenance);
}

async function finalizeCloudflare(root, version, wasmName, provenance)
{
	const runtime = `php${version}-cloudflare-runtime.mjs`;
	const entrypoint = `php${version}-cloudflare.mjs`;
	const adapter = `// Generated after content-addressing. Import inside a Worker module; instantiate inside fetch.\nimport { PhpCloudflare as CloudflareBase } from './PhpCloudflare.mjs';\nimport runtime from './${runtime}';\nimport wasmModule from './${wasmName}';\n\nexport class PhpCloudflare extends CloudflareBase {\n\tconstructor(args = {}) { super({...args, version: '${version}', runtime, wasmModule}); }\n}\nexport default PhpCloudflare;\n`;
	await fs.writeFile(path.join(root, entrypoint), adapter);
	const declaration = `import type { PhpCloudflareOptions } from './public.d.ts';\nimport type { PhpBase } from './PhpBase.mjs';\nexport declare class PhpCloudflare extends PhpBase { constructor(args?: PhpCloudflareOptions); }\nexport default PhpCloudflare;\n`;
	await fs.writeFile(path.join(root, `php${version}-cloudflare.d.mts`), declaration);
	const manifest = await writeManifest(root, version, cloudflareProfile, wasmName, provenance);
	await verifyCloudflare(root, version);
	return manifest;
}

const copyPackageSources = stage => copyRuntimeSources(stage, cloudflareProfile);

// Make owns the native build. Package a copy so hashing never mutates its
// incremental JS/Wasm outputs, and validate before replacing public artifacts.
export async function packageCloudflareBuild(source, version, destination)
{
	if(!versionPattern.test(version)) throw new Error(`Unsupported PHP version: ${version}`);
	if(path.resolve(source) === path.resolve(destination)) throw new Error('Cloudflare packaging requires separate raw and final directories');
	const provenance = {profile: 'cloudflare', phpVersion: version, emscripten: '6.0.6'};
	try
	{
		const {sourceSha256, builderImage} = JSON.parse(await fs.readFile('.build-info.json', 'utf8'));
		Object.assign(provenance, {sourceSha256, builderImage});
	}
	catch(error) { if(error.code !== 'ENOENT') throw error; }
	for(const [name, directory] of [['php', `php${version}-src`], ['zlib', 'zlib'], ['libzip', 'libzip']])
	{
		const revision = (await fs.readFile(`third_party/${directory}/.git/HEAD`, 'utf8')).trim();
		if(!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`Expected detached source revision for ${name}`);
		provenance[name] = {revision};
	}
	for(const name of ['vrzno', 'pdo-cfd1']) provenance[name] = JSON.parse(await fs.readFile(`third_party/${name}/.php-wasm-source.json`, 'utf8'));
	for(const [name, setting] of [['initialMemory', 'INITIAL_MEMORY'], ['maximumMemory', 'MAXIMUM_MEMORY']])
	{
		const match = /^(\d+)(KB|MB|GB)?$/.exec(process.env[setting] ?? '');
		if(!match) throw new Error(`Invalid or missing ${setting} from Make`);
		provenance[name] = Number(match[1]) * 1024 ** ['', 'KB', 'MB', 'GB'].indexOf(match[2] ?? '');
	}
	const stage = await fs.mkdtemp(path.join(path.resolve(source), 'package-'));
	try
	{
		const runtime = `php${version}-cloudflare-runtime.mjs`;
		for(const name of [runtime, `${runtime}.wasm`]) await fs.copyFile(path.join(source, name), path.join(stage, name));
		await copyPackageSources(stage);
		await packageCloudflare(stage, version, provenance);
		const {mergeCloudflare} = await import('./merge-cloudflare.mjs');
		await mergeCloudflare(path.resolve(destination), [stage], {replaceGenerated: true});
		return (await verifyCloudflare(destination, version)).manifest;
	}
	finally { await fs.rm(stage, {recursive: true, force: true}); }
}

// Reuse an already verified native build, never rebuild or mutate its inputs.
// Helpers and metadata come from the current source package, not the old output.
export async function repackageCloudflare(source, destination, version)
{
	if(path.resolve(source) === path.resolve(destination)) throw new Error('Cloudflare repackaging requires a separate destination');
	const {manifest, manifestName} = await verifyCloudflare(source, version, {allowLegacy: true});
	const wasmName = manifest.files.find(file => /^[a-f0-9]{40}\.wasm$/.test(file.path))?.path;
	if(!wasmName) throw new Error('Cloudflare source manifest has no Wasm artifact');
	const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'php-cloud-wasm-repackage-'));
	try
	{
		for(const name of [manifest.runtime, wasmName]) await fs.copyFile(path.join(source, name), path.join(stage, name));
		await copyPackageSources(stage);
		const provenance = {...manifest.provenance, repackagedFrom: {schema: manifest.schema, manifestSha256: sha256(await fs.readFile(path.join(source, manifestName)))}};
		await finalizeCloudflare(stage, version, wasmName, provenance);
		const {mergeCloudflare} = await import('./merge-cloudflare.mjs');
		await mergeCloudflare(path.resolve(destination), [stage]);
		return (await verifyCloudflare(destination, version)).manifest;
	}
	finally { await fs.rm(stage, {recursive: true, force: true}); }
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const args = process.argv.slice(2);
	const task = args[0] === '--from' ? repackageCloudflare(...args.slice(1))
		: args[0] === '--build' ? packageCloudflareBuild(...args.slice(1)) : packageCloudflare(...args);
	task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
