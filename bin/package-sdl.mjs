#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {checkVersion, contentAddressRuntime, copyRuntimeSources, digest, mergeRuntimePackages, verifyManifest, writeManifest} from './runtime-package.mjs';

export const sdlProfile = {
	id: 'sdl', name: 'php-sdl-wasm', label: 'SDL', adapter: 'PhpSdl.mjs'
	, extraFiles: {
		'LICENSE-PHP': 'opengl/LICENSE'
		, 'LICENSE-sdl_image': 'patches/sdl_image.LICENSE'
		, 'LICENSE-sdl_mixer': 'patches/sdl_mixer.LICENSE'
		, 'LICENSE-sdl_ttf': 'patches/sdl_ttf.LICENSE'
	}
	, declarations: ['PhpSdl.d.mts', 'PhpWebBase.d.mts', 'PhpBase.d.mts', 'public.d.ts']
	, assetPattern: /^(?:[A-Za-z0-9_.-]+\.(?:mjs|d\.mts|d\.ts)|[a-f0-9]{40}\.(?:wasm|so|dat|data))$/
};

/** Reads the native dependency names recorded by the linker, without external tools. */
export function wasmLibraries(binary)
{
	const module = new WebAssembly.Module(binary);
	const sections = WebAssembly.Module.customSections(module, 'dylink.0');
	const names = [];
	for(const section of sections)
	{
		const bytes = new Uint8Array(section);
		let offset = 0;
		const number = () => {
			let value = 0, shift = 0;
			while(offset < bytes.length && shift < 35)
			{
				const byte = bytes[offset++];
				value += (byte & 127) * 2 ** shift;
				if(!(byte & 128)) return value;
				shift += 7;
			}
			throw new Error('Invalid SDL dylink integer');
		};
		while(offset < bytes.length)
		{
			const type = bytes[offset++];
			const size = number();
			const end = offset + size;
			if(end > bytes.length) throw new Error('Invalid SDL dylink section');
			if(type === 2)
			{
				const count = number();
				for(let index = 0; index < count; index++)
				{
					const length = number();
					if(offset + length > end) throw new Error('Invalid SDL dylink name');
					const name = new TextDecoder().decode(bytes.subarray(offset, offset + length));
					if(!/^[A-Za-z0-9_.-]+\.so$/.test(name)) throw new Error(`Invalid SDL shared library name: ${name}`);
					names.push(name);
					offset += length;
				}
				if(offset !== end) throw new Error('Invalid SDL dylink dependency list');
			}
			offset = end;
		}
	}
	return [...new Set(names)];
}

/** Validates browser loading and every transitive native dependency in the final package. */
export async function verifySdl(root, version)
{
	const result = await verifyManifest(root, version, sdlProfile);
	const {manifest, names} = result;
	const assets = manifest.assets;
	if(!Array.isArray(assets)) throw new Error('SDL manifest must describe supporting assets');
	const native = manifest.files.filter(file => /^[a-f0-9]{40}\.wasm$/.test(file.path));
	if(native.length !== 1) throw new Error('SDL manifest must own exactly one main Wasm module');
	const libraryNames = new Set();
	const seen = new Set();
	for(const asset of assets)
	{
		if(!/^[A-Za-z0-9_.-]+$/.test(asset.name) || ['.', '..'].includes(asset.name) || seen.has(asset.name)
			|| !['library', 'preload', 'resource'].includes(asset.type) || !names.has(asset.path)
			|| !/^[a-f0-9]{40}\.(?:so|dat|data)$/.test(asset.path)) throw new Error('Invalid SDL supporting asset');
		seen.add(asset.name);
		if(asset.type === 'library')
		{
			if(!asset.name.endsWith('.so') || !asset.path.endsWith('.so')) throw new Error('Invalid SDL library asset');
			libraryNames.add(asset.name);
		}
		if(asset.type === 'preload' && asset.mountPath !== `/preload/${asset.name}`) throw new Error('Invalid SDL preload path');
	}
	for(const name of names)
		if(/\.(?:so|dat|data)$/.test(name) && !assets.some(asset => asset.path === name)) throw new Error(`Undeclared SDL supporting asset: ${name}`);
	for(const file of [native[0], ...assets])
	{
		const bytes = await fs.readFile(path.join(root, file.path));
		if(createHash('sha1').update(bytes).digest('hex') !== file.path.split('.')[0]) throw new Error(`SDL content-address mismatch: ${file.path}`);
		if(file === native[0] || file.type === 'library')
		{
			for(const needed of wasmLibraries(bytes))
				if(!libraryNames.has(needed)) throw new Error(`SDL manifest is missing native dependency: ${needed}`);
		}
	}
	const runtime = await fs.readFile(path.join(root, manifest.runtime), 'utf8');
	if(!runtime.includes(native[0].path)) throw new Error('SDL factory does not reference its matched Wasm artifact');
	const entry = await fs.readFile(path.join(root, manifest.entrypoint), 'utf8');
	for(const asset of assets)
		if(!entry.includes(`./${asset.path}`)) throw new Error(`SDL adapter is missing supporting asset: ${asset.name}`);
	return result;
}

/** Creates the version-bound browser adapter and the shared package manifest. */
export async function packageSdl(root, version, provenance = {}, assets = [])
{
	checkVersion(version);
	const runtime = `php${version}-sdl-runtime.mjs`;
	try
	{ await fs.access(path.join(root, `${runtime}.wasm`)); }
	catch(error)
	{
		if(error.code !== 'ENOENT') throw error;
		return (await verifySdl(root, version)).manifest;
	}
	const wasmName = await contentAddressRuntime(root, runtime, 'SDL');
	const declarations = `import type { PhpSdlOptions } from './public.d.ts';\nimport type { PhpWebBase } from './PhpWebBase.mjs';\nexport declare class PhpSdl extends PhpWebBase { constructor(args?: PhpSdlOptions); }\nexport default PhpSdl;\n`;
	const libraries = assets.filter(asset => asset.type === 'library').map(asset => `{name: ${JSON.stringify(asset.name)}, url: new URL(${JSON.stringify('./' + asset.path)}, import.meta.url)}`);
	const preloads = assets.filter(asset => asset.type === 'preload').map(asset => `{name: ${JSON.stringify(asset.name)}, parent: '/preload/', path: ${JSON.stringify(asset.mountPath)}, url: new URL(${JSON.stringify('./' + asset.path)}, import.meta.url)}`);
	const resources = assets.filter(asset => asset.type === 'resource').map(asset => `${JSON.stringify(asset.name)}: new URL(${JSON.stringify('./' + asset.path)}, import.meta.url)`);
	const adapter = `// Generated from a matching browser PHP/SDL build.\nimport { PhpSdl as SdlBase } from './PhpSdl.mjs';\nimport runtime from './${runtime}';\n\nconst libraries = [${libraries.join(',\n\t')}];\nconst preloads = [${preloads.join(',\n\t')}];\nconst resources = {${resources.join(',\n\t')}};\n\nexport class PhpSdl extends SdlBase {\n\tconstructor(args = {}) {\n\t\tsuper({...args, version: '${version}', runtime\n\t\t\t, sharedLibs: [...libraries, ...(args.sharedLibs ?? [])]\n\t\t\t, files: [...preloads, ...(args.files ?? [])]\n\t\t\t, locateFile: (name, directory) => args.locateFile?.(name, directory) ?? resources[name] ?? resources[String(name).split('/').pop()]\n\t\t});\n\t}\n}\nexport default PhpSdl;\n`;
	await fs.writeFile(path.join(root, `php${version}-sdl.mjs`), adapter);
	await fs.writeFile(path.join(root, `php${version}-sdl.d.mts`), declarations);
	const manifest = await writeManifest(root, version, sdlProfile, wasmName, provenance, {assets});
	await verifySdl(root, version);
	return manifest;
}

/** Resolves only native dependencies actually named by this build's Wasm modules. */
async function copySupportingAssets(stage, source, binary, packagesRoot, native)
{
	const assets = [];
	const visited = new Set();
	const directories = [source, ...(await fs.readdir(packagesRoot, {withFileTypes: true})).filter(entry => entry.isDirectory()).map(entry => path.join(packagesRoot, entry.name))];
	async function copy(name, type, filename)
	{
		if(visited.has(name)) return;
		visited.add(name);
		let bytes;
		for(const candidate of filename ? [filename] : directories.map(directory => path.join(directory, name)))
		{
			try
			{
				if(!(await fs.lstat(candidate)).isFile()) throw new Error(`SDL supporting asset must be a regular file: ${candidate}`);
				const content = await fs.readFile(candidate);
				if(bytes && !bytes.equals(content)) throw new Error(`Conflicting SDL supporting asset: ${name}`);
				bytes = content;
			}
			catch(error)
			{ if(error.code !== 'ENOENT') throw error; }
		}
		if(!bytes) throw new Error(`Missing SDL supporting asset: ${name}`);
		const output = createHash('sha1').update(bytes).digest('hex') + path.extname(name);
		await fs.writeFile(path.join(stage, output), bytes);
		assets.push({name, path: output, type, ...(type === 'preload' ? {mountPath: `/preload/${name}`} : {})});
		if(type === 'library')
		{
			for(const needed of wasmLibraries(bytes)) await copy(needed, 'library');
		}
	}
	for(const name of wasmLibraries(binary)) await copy(name, 'library');
	if(visited.has('libicudata.so')) await copy('icudt72l.dat', 'preload', path.join(packagesRoot, 'intl/icudt72l.dat'));
	for(const name of new Set([...native.matchAll(/['"]([A-Za-z0-9_.-]+\.data)['"]/g)].map(match => match[1]))) await copy(name, 'resource', path.join(source, name));
	return assets.sort((a, b) => a.name.localeCompare(b.name));
}

/** Packages existing Make outputs without rebuilding or modifying the native pair. */
export async function packageSdlBuild(source, version, destination, {packagesRoot = path.resolve('packages'), provenance = {}} = {})
{
	checkVersion(version);
	if(path.resolve(source) === path.resolve(destination)) throw new Error('SDL packaging requires separate raw and final directories');
	const nativeName = `php${version}_sdl-web.mjs`;
	const native = await fs.readFile(path.join(source, nativeName), 'utf8');
	const wasmNames = [...new Set([...native.matchAll(/['"]([a-f0-9]{40}\.wasm|php8\.[0-5][A-Za-z0-9_.-]*\.wasm)['"]/g)].map(match => match[1]))];
	if(wasmNames.length !== 1) throw new Error('SDL factory must reference exactly one matching Wasm file');
	const binary = await fs.readFile(path.join(source, wasmNames[0]));
	const stage = await fs.mkdtemp(path.join(path.resolve(source), 'sdl-package-'));
	try
	{
		const runtime = `php${version}-sdl-runtime.mjs`;
		await fs.writeFile(path.join(stage, runtime), native.replaceAll(wasmNames[0], `${runtime}.wasm`));
		await fs.writeFile(path.join(stage, `${runtime}.wasm`), binary);
		await copyRuntimeSources(stage, sdlProfile);
		const assets = await copySupportingAssets(stage, source, binary, packagesRoot, native);
		const build = {profile: 'sdl', phpVersion: version, ...provenance, nativeFactorySha256: digest(Buffer.from(native)), nativeWasmSha256: digest(binary)};
		try
		{
			const {sourceSha256, builderImage} = JSON.parse(await fs.readFile('.build-info.json', 'utf8'));
			Object.assign(build, {sourceSha256, builderImage});
		}
		catch(error)
		{ if(error.code !== 'ENOENT') throw error; }
		await packageSdl(stage, version, build, assets);
		await mergeSdl(destination, [stage], {replaceGenerated: true});
		return (await verifySdl(destination, version)).manifest;
	}
	finally
	{ await fs.rm(stage, {recursive: true, force: true}); }
}

/** Merges PHP versions only when every shared helper and metadata file agrees. */
export function mergeSdl(destination, sources, options)
{
	return mergeRuntimePackages(destination, sources, sdlProfile, verifySdl, options);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const [command, ...args] = process.argv.slice(2);
	const task = command === '--build' ? packageSdlBuild(...args)
		: command === '--verify' ? verifySdl(...args) : packageSdl(command, ...args);
	task.catch(error => {console.error(error.message); process.exitCode = 1;});
}
