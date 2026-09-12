#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const versionPattern = /^8\.[0-5]$/;
export const cloudflarePackageFiles = ['package.json', 'README.md', 'LICENSE', 'NOTICE'];
const declarations = ['PhpCloudflare.d.mts', 'PhpBase.d.mts', 'public.d.ts'];

export async function verifyCloudflare(root, version, {allowLegacy = false} = {})
{
	if(!versionPattern.test(version)) throw new Error(`Unsupported PHP version: ${version}`);
	const manifestName = `php${version}-cloudflare.manifest.json`;
	if(!(await fs.lstat(path.join(root, manifestName))).isFile()) throw new Error('Cloudflare manifest must be a regular file');
	const manifest = JSON.parse(await fs.readFile(path.join(root, manifestName), 'utf8'));
	const legacy = allowLegacy && manifest.schema === 1;
	if((!legacy && (manifest.schema !== 2 || manifest.packageName !== 'php-cloud-wasm')) || manifest.phpVersion !== version || !Array.isArray(manifest.files) || !manifest.files.length
		|| manifest.entrypoint !== `php${version}-cloudflare.mjs` || manifest.runtime !== `php${version}-cloudflare-runtime.mjs`)
		throw new Error(`Invalid Cloudflare manifest: ${manifestName}`);
	const names = new Set();
	for(const file of manifest.files)
	{
		if(!/^[A-Za-z0-9_.-]+$/.test(file.path) || ['.', '..'].includes(file.path) || names.has(file.path)
			|| (!/^(?:[A-Za-z0-9_.-]+\.(?:mjs|d\.mts|d\.ts)|[a-f0-9]{40}\.wasm)$/.test(file.path) && !cloudflarePackageFiles.includes(file.path))
			|| !/^[a-f0-9]{64}$/.test(file.sha256))
			throw new Error(`Invalid Cloudflare asset: ${file.path}`);
		names.add(file.path);
		const filename = path.join(root, file.path);
		if(!(await fs.lstat(filename)).isFile()) throw new Error(`Non-regular Cloudflare asset: ${file.path}`);
		const contents = await fs.readFile(filename);
		if(sha256(contents) !== file.sha256) throw new Error(`Cloudflare artifact digest mismatch: ${file.path}`);
		if(file.bytes !== undefined && file.bytes !== contents.length) throw new Error(`Cloudflare artifact size mismatch: ${file.path}`);
	}
	for(const name of [manifest.entrypoint, manifest.runtime, 'PhpCloudflare.mjs', 'PhpBase.mjs', 'PhpCloudflare.d.mts', 'PhpBase.d.mts', 'public.d.ts', `php${version}-cloudflare.d.mts`])
		if(!names.has(name)) throw new Error(`Cloudflare manifest is missing ${name}`);
	if(!legacy)
	{
		for(const name of cloudflarePackageFiles)
			if(!names.has(name)) throw new Error(`Cloudflare manifest is missing ${name}`);
		const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
		if(pkg.name !== 'php-cloud-wasm' || pkg.type !== 'module') throw new Error('Invalid Cloudflare package metadata');
		function checkTarget(value)
		{
			if(typeof value === 'string' && !value.includes('*') && (!value.startsWith('./') || !names.has(value.slice(2))))
				throw new Error(`Cloudflare package export is missing: ${value}`);
			if(value && typeof value === 'object') for(const entry of Object.values(value)) checkTarget(entry);
		}
		checkTarget(pkg.exports);
	}
	for(const name of names)
	{
		if(!name.endsWith('.mjs')) continue;
		const text = await fs.readFile(path.join(root, name), 'utf8');
		for(const match of text.matchAll(/(?:from\s*|import\s*)['"]\.\/([A-Za-z0-9_.-]+\.(?:mjs|wasm))['"]/g))
			if(!names.has(match[1])) throw new Error(`Cloudflare manifest is missing dependency ${match[1]} of ${name}`);
	}
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
	const binary = await fs.readFile(rawWasm);
	if(!WebAssembly.validate(binary)) throw new Error('Invalid Cloudflare WebAssembly output');
	const wasmName = `${createHash('sha1').update(binary).digest('hex')}.wasm`;
	const loader = await fs.readFile(path.join(root, runtime), 'utf8');
	if(!loader.includes(`${runtime}.wasm`)) throw new Error('Cloudflare JS loader does not reference its matching Wasm output');
	execFileSync('bash', [path.join(repoRoot, 'compress-package.sh'), root], {stdio: 'inherit'});
	return finalizeCloudflare(root, version, wasmName, provenance);
}

async function finalizeCloudflare(root, version, wasmName, provenance)
{
	const runtime = `php${version}-cloudflare-runtime.mjs`;
	const entrypoint = `php${version}-cloudflare.mjs`;
	const adapter = `// Generated after content-addressing. Import inside a Worker module; instantiate inside fetch.\nimport { PhpCloudflare as CloudflareBase } from './PhpCloudflare.mjs';\nimport runtime from './${runtime}';\nimport wasmModule from './${wasmName}';\n\nexport class PhpCloudflare extends CloudflareBase {\n\tconstructor(args = {}) { super({...args, version: '${version}', runtime, wasmModule}); }\n}\nexport default PhpCloudflare;\n`;
	await fs.writeFile(path.join(root, entrypoint), adapter);
	const declaration = `import type { PhpCloudflareOptions } from './public';\nimport { PhpBase } from './public';\nexport declare class PhpCloudflare extends PhpBase { constructor(args?: PhpCloudflareOptions); }\nexport default PhpCloudflare;\n`;
	await fs.writeFile(path.join(root, `php${version}-cloudflare.d.mts`), declaration);
	const names = new Set([entrypoint, runtime, wasmName, `php${version}-cloudflare.d.mts`, ...declarations, ...cloudflarePackageFiles]);
	async function imports(name)
	{
		if(names.has(name)) return;
		names.add(name);
		const content = await fs.readFile(path.join(root, name), 'utf8');
		for(const match of content.matchAll(/(?:from\s*|import\s*)['"]\.\/([A-Za-z0-9_.-]+\.mjs)['"]/g)) await imports(match[1]);
	}
	await imports('PhpCloudflare.mjs');
	const files = [];
	for(const name of [...names].sort())
	{
		const contents = await fs.readFile(path.join(root, name));
		files.push({path: name, sha256: sha256(contents), bytes: contents.length});
	}
	const manifest = {schema: 2, packageName: 'php-cloud-wasm', phpVersion: version, entrypoint, runtime, provenance, files};
	await fs.writeFile(path.join(root, `php${version}-cloudflare.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
	await verifyCloudflare(root, version);
	return manifest;
}

// Reuse an already verified native build, never rebuild or mutate its inputs.
// Helpers and metadata come from the current source package, not the old output.
export async function repackageCloudflare(source, destination, version)
{
	if(path.resolve(source) === path.resolve(destination)) throw new Error('Cloudflare repackaging requires a separate destination');
	const {manifest, manifestName} = await verifyCloudflare(source, version, {allowLegacy: true});
	const wasmName = manifest.files.find(file => /^[a-f0-9]{40}\.wasm$/.test(file.path))?.path;
	if(!wasmName) throw new Error('Cloudflare source manifest has no Wasm artifact');
	let template = path.join(repoRoot, 'packages/php-cloud-wasm');
	try { await fs.access(path.join(template, 'package.json')); }
	catch { template = path.dirname(createRequire(import.meta.url).resolve('php-cloud-wasm/package.json')); }
	const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'php-cloud-wasm-repackage-'));
	try
	{
		for(const name of [manifest.runtime, wasmName]) await fs.copyFile(path.join(source, name), path.join(stage, name));
		for(const name of [...declarations, ...cloudflarePackageFiles]) await fs.copyFile(path.join(template, name), path.join(stage, name));
		const visited = new Set();
		async function copyHelper(name)
		{
			if(visited.has(name)) return;
			visited.add(name);
			const content = await fs.readFile(path.join(repoRoot, 'source', name));
			await fs.writeFile(path.join(stage, name), content);
			for(const match of content.toString().matchAll(/(?:from\s*|import\s*)['"]\.\/([A-Za-z0-9_.-]+\.mjs)['"]/g)) await copyHelper(match[1]);
		}
		await copyHelper('PhpCloudflare.mjs');
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
	const task = args[0] === '--from' ? repackageCloudflare(...args.slice(1)) : packageCloudflare(...args);
	task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
