import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtimePackageFiles = ['package.json', 'README.md', 'LICENSE', 'NOTICE'];
export const digest = data => createHash('sha256').update(data).digest('hex');

/** Validates the supported PHP release before constructing artifact paths. */
export function checkVersion(version)
{
	if(!/^8\.[0-5]$/.test(version)) throw new Error(`Unsupported PHP version: ${version}`);
}

/** Finds package-local static imports in a wrapper or generated adapter. */
export function localImports(source)
{
	return [...source.matchAll(/(?:from\s*|import\s*)['"]\.\/([A-Za-z0-9_.-]+\.(?:mjs|wasm))['"]/g)].map(match => match[1]);
}

/** Checks manifest ownership and digests; the caller checks its runtime's loading contract. */
export async function verifyManifest(root, version, profile, {allowLegacy = false} = {})
{
	checkVersion(version);
	const {id, name: packageName, label, declarations, adapter, assetPattern} = profile;
	const packageFiles = [...runtimePackageFiles, ...Object.keys(profile.extraFiles ?? {})];
	const manifestName = `php${version}-${id}.manifest.json`;
	if(!(await fs.lstat(path.join(root, manifestName))).isFile()) throw new Error(`${label} manifest must be a regular file`);
	const manifest = JSON.parse(await fs.readFile(path.join(root, manifestName), 'utf8'));
	const legacy = allowLegacy && manifest.schema === 1;
	if((!legacy && (manifest.schema !== 2 || manifest.packageName !== packageName)) || manifest.phpVersion !== version || !Array.isArray(manifest.files) || !manifest.files.length
		|| manifest.entrypoint !== `php${version}-${id}.mjs` || manifest.runtime !== `php${version}-${id}-runtime.mjs`)
		throw new Error(`Invalid ${label} manifest: ${manifestName}`);
	const names = new Set();
	for(const file of manifest.files)
	{
		if(!/^[A-Za-z0-9_.-]+$/.test(file.path) || ['.', '..'].includes(file.path) || names.has(file.path)
			|| (!assetPattern.test(file.path) && !packageFiles.includes(file.path)) || !/^[a-f0-9]{64}$/.test(file.sha256))
			throw new Error(`Invalid ${label} asset: ${file.path}`);
		names.add(file.path);
		const filename = path.join(root, file.path);
		if(!(await fs.lstat(filename)).isFile()) throw new Error(`Non-regular ${label} asset: ${file.path}`);
		const contents = await fs.readFile(filename);
		if(digest(contents) !== file.sha256) throw new Error(`${label} artifact digest mismatch: ${file.path}`);
		if(file.bytes !== undefined && file.bytes !== contents.length) throw new Error(`${label} artifact size mismatch: ${file.path}`);
	}
	for(const name of [manifest.entrypoint, manifest.runtime, adapter, 'PhpBase.mjs', ...declarations, `php${version}-${id}.d.mts`])
		if(!names.has(name)) throw new Error(`${label} manifest is missing ${name}`);
	if(!legacy)
	{
		for(const name of packageFiles)
			if(!names.has(name)) throw new Error(`${label} manifest is missing ${name}`);
		const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
		if(pkg.name !== packageName || pkg.type !== 'module') throw new Error(`Invalid ${label} package metadata`);
		function checkTarget(value)
		{
			if(typeof value === 'string' && !value.includes('*') && (!value.startsWith('./') || !names.has(value.slice(2))))
				throw new Error(`${label} package export is missing: ${value}`);
			if(value && typeof value === 'object') for(const entry of Object.values(value)) checkTarget(entry);
		}
		checkTarget(pkg.exports);
	}
	for(const name of names)
	{
		if(!name.endsWith('.mjs')) continue;
		for(const dependency of localImports(await fs.readFile(path.join(root, name), 'utf8')))
			if(!names.has(dependency)) throw new Error(`${label} manifest is missing dependency ${dependency} of ${name}`);
	}
	return {manifest, manifestName, names};
}

/** Hashes one matching raw JS/Wasm pair in a staging directory. */
export async function contentAddressRuntime(root, runtime, label)
{
	const rawName = `${runtime}.wasm`;
	const binary = await fs.readFile(path.join(root, rawName));
	if(!WebAssembly.validate(binary)) throw new Error(`Invalid ${label} WebAssembly output`);
	const wasmName = `${createHash('sha1').update(binary).digest('hex')}.wasm`;
	const loader = await fs.readFile(path.join(root, runtime), 'utf8');
	if(!loader.includes(rawName)) throw new Error(`${label} JS loader does not reference its matching Wasm output`);
	await fs.writeFile(path.join(root, wasmName), binary);
	await fs.writeFile(path.join(root, runtime), loader.replaceAll(rawName, wasmName));
	await fs.rm(path.join(root, rawName));
	return wasmName;
}

/** Captures the helper import closure and exact bytes of a versioned package. */
export async function writeManifest(root, version, profile, wasmName, provenance, extra = {})
{
	const {id, name: packageName, declarations, adapter} = profile;
	const runtime = `php${version}-${id}-runtime.mjs`;
	const entrypoint = `php${version}-${id}.mjs`;
	const names = new Set([entrypoint, runtime, wasmName, `php${version}-${id}.d.mts`, ...declarations, ...runtimePackageFiles, ...Object.keys(profile.extraFiles ?? {}), ...(extra.assets ?? []).map(asset => asset.path)]);
	const visited = new Set();
	async function imports(name)
	{
		if(visited.has(name)) return;
		visited.add(name);
		names.add(name);
		for(const dependency of localImports(await fs.readFile(path.join(root, name), 'utf8')))
			if(dependency.endsWith('.mjs')) await imports(dependency);
	}
	await imports(adapter);
	const files = [];
	for(const name of [...names].sort())
	{
		const contents = await fs.readFile(path.join(root, name));
		files.push({path: name, sha256: digest(contents), bytes: contents.length});
	}
	const manifest = {schema: 2, packageName, phpVersion: version, entrypoint, runtime, provenance, ...extra, files};
	await fs.writeFile(path.join(root, `php${version}-${id}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

/** Copies source wrappers and declarations without depending on another runtime package. */
export async function copyRuntimeSources(stage, profile)
{
	let template = path.join(repoRoot, 'packages', profile.name);
	try
	{ await fs.access(path.join(template, 'package.json')); }
	catch
	{ template = path.dirname(createRequire(import.meta.url).resolve(`${profile.name}/package.json`)); }
	for(const name of [...profile.declarations, ...runtimePackageFiles]) await fs.copyFile(path.join(template, name), path.join(stage, name));
	for(const [name, source] of Object.entries(profile.extraFiles ?? {})) await fs.copyFile(path.join(template, source), path.join(stage, name));
	const visited = new Set();
	async function copyHelper(name)
	{
		if(visited.has(name)) return;
		visited.add(name);
		const content = await fs.readFile(path.join(repoRoot, 'source', name));
		await fs.writeFile(path.join(stage, name), content);
		for(const dependency of localImports(content.toString())) await copyHelper(dependency);
	}
	await copyHelper(profile.adapter);
}

/** Merges only verified manifest-owned files, checking every overlap before writing. */
export async function mergeRuntimePackages(destination, sources, profile, verify, {replaceGenerated = false} = {})
{
	const pending = new Map();
	const pattern = new RegExp(`^php8\\.[0-5]-${profile.id}\\.manifest\\.json$`);
	for(const root of sources)
	{
		const manifests = (await fs.readdir(root)).filter(name => pattern.test(name));
		if(!manifests.length) throw new Error(`No ${profile.label} manifests in ${root}`);
		for(const filename of manifests)
		{
			const {manifest} = await verify(root, filename.slice(3, 6));
			for(const name of [...manifest.files.map(file => file.path), filename])
			{
				const data = await fs.readFile(path.join(root, name));
				if(pending.has(name) && !pending.get(name).equals(data)) throw new Error(`Conflicting ${profile.label} asset: ${name}`);
				pending.set(name, data);
			}
		}
	}
	if(replaceGenerated)
	{
		let existing = [];
		try
		{ existing = await fs.readdir(destination); } catch(error)
		{ if(error.code !== 'ENOENT') throw error; }
		for(const name of existing.filter(name => pattern.test(name) && !pending.has(name)))
		{
			const {manifest} = await verify(destination, name.slice(3, 6));
			for(const file of manifest.files)
				if(pending.has(file.path) && digest(pending.get(file.path)) !== file.sha256)
					throw new Error(`Rebuilding would invalidate ${name}: ${file.path}; use a fresh output directory`);
		}
	}
	for(const [name, data] of pending)
	{
		try
		{
			const target = path.join(destination, name);
			if(!(await fs.lstat(target)).isFile()) throw new Error(`Non-regular destination asset: ${name}`);
			if(!replaceGenerated && !(await fs.readFile(target)).equals(data)) throw new Error(`Conflicting destination asset: ${name}`);
		}
		catch(error)
		{ if(error.code !== 'ENOENT') throw error; }
	}
	await fs.mkdir(destination, {recursive: true});
	for(const [name, data] of pending) await fs.writeFile(path.join(destination, name), data);
}
