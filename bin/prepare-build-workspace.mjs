#!/usr/bin/env node
// Filesystem preparation only. Compilation and container execution belong to Make.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootFiles = ['Makefile', 'build-workspace.mak', 'php.mk', 'info.mak', 'ico.ans', 'compress-package.sh', 'emscripten-builder.dockerfile', 'docker-compose.yml', 'package.json', '.babelrc'];
const digest = value => createHash('sha256').update(value).digest('hex');

export function allowedSource(relative)
{
	const parts = relative.split('/');
	if(parts.some(part => part.startsWith('.env') || ['..', '.php-wasm-rc', '.npmrc', '.aws', '.ssh', '.git', 'node_modules', 'mapped'].includes(part))) return false;
	if(/\.(?:pem|key|p12|pfx|wasm|so|data|dat|log|map|gz|br|BAK)$/.test(relative)) return false;
	if(/^packages\/php-(?:wasm|cloud-wasm|sdl-wasm|cgi-wasm|cli-wasm|dbg-wasm)\/[^/]+\.(?:mjs|js|manifest\.json)$/.test(relative)) return false;
	if(/^packages\/php-(?:cloud|sdl)-wasm\/php8\.[0-5]-(?:cloudflare|sdl)\.d\.mts$/.test(relative)) return false;
	if(/^packages\/php-sdl-wasm\/LICENSE-(?:PHP|sdl_)/.test(relative)) return false;
	return true;
}

async function sourceFiles(sourceRoot, packageFolders)
{
	const metadata = JSON.parse(await fs.readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
	const packages = new Map(Object.entries(metadata.dependencies).filter(([, directory]) => directory.startsWith('./packages/')).map(([name, directory]) => [directory.slice(11), name]));
	const files = new Map();
	async function collect(relative, source = path.join(sourceRoot, relative))
	{
		if(!allowedSource(relative)) return;
		const stat = await fs.lstat(source);
		if(stat.isSymbolicLink()) throw new Error(`Build workspace does not follow symlinks: ${relative}`);
		if(stat.isDirectory())
		{
			for(const name of (await fs.readdir(source)).sort()) await collect(`${relative}/${name}`, path.join(source, name));
		}
		else if(stat.isFile()) files.set(relative, {data: await fs.readFile(source), mode: stat.mode & 0o777});
	}
	for(const relative of [...rootFiles, 'source', 'patch', 'profiles', 'bin', '.github/bin']) await collect(relative);
	const defaults = packages.size ? [...packages.keys()] : [
		...(metadata.workspaces ?? []).map(directory => path.basename(directory))
		, ...Object.keys(metadata.dependencies).filter(name => name.endsWith('-wasm'))
	];
	for(const folder of packageFolders?.length ? packageFolders : defaults)
	{
		const packageName = packages.get(folder) ?? [folder, `php-wasm-${folder}`, `php-wasm-${folder.replace(/^lib/, '')}`].find(name => Object.hasOwn(metadata.dependencies, name));
		if(!/^[a-z0-9-]+$/.test(folder) || !packageName) throw new Error(`Unknown build package: ${folder}`);
		let source = path.join(sourceRoot, 'packages', folder);
		try { await fs.lstat(source); }
		catch(error)
		{
			if(error.code !== 'ENOENT') throw error;
			source = await fs.realpath(path.dirname(createRequire(path.join(sourceRoot, 'package.json')).resolve(`${packageName}/package.json`)));
		}
		await collect(`packages/${folder}`, source);
	}
	return files;
}

async function writeSources(destination, files)
{
	for(const [relative, {data, mode}] of files)
	{
		const target = path.join(destination, relative);
		try { if((await fs.readFile(target)).equals(data)) continue; }
		catch(error) { if(error.code !== 'ENOENT') throw error; }
		await fs.mkdir(path.dirname(target), {recursive: true});
		await fs.writeFile(target, data, {mode});
	}
}

export async function snapshot(destination, sourceRoot = repoRoot, packageFolders)
{
	const files = await sourceFiles(sourceRoot, packageFolders);
	await writeSources(destination, files);
	return digest(JSON.stringify([...files].map(([name, {data}]) => [name, digest(data)])));
}

export async function prepareBuildWorkspace(cacheRoot, environment, version, configuration = '', packageFolders, sourceRoot = repoRoot)
{
	if(!/^8\.[0-5]$/.test(version)) throw new Error(`Unsupported PHP version: ${version}`);
	const files = await sourceFiles(sourceRoot, packageFolders);
	files.set('.build-env.mak', {data: await fs.readFile(path.resolve(sourceRoot, environment)), mode: 0o600});
	try { files.set(`.build-env.mak.${version}`, {data: await fs.readFile(path.resolve(sourceRoot, `${environment}.${version}`)), mode: 0o600}); }
	catch(error) { if(error.code !== 'ENOENT') throw error; }
	const hashes = [...files].map(([name, {data, mode}]) => [name, digest(data), mode]);
	// Wrapper/declaration edits can reuse the native build. Native source, build
	// rules, selected configuration, command-line overrides and image select state.
	const native = hashes.filter(([name]) => !/\.(?:mjs|md|d\.ts|d\.mts)$/.test(name) || /(?:^|\/)import-source\.mjs$|^bin\/source-importer\.mjs$/.test(name));
	const builderImage = process.env.BUILD_IMAGE_ID ?? null;
	const settings = Object.entries(process.env).filter(([name]) => /^(?:WITH_|EXTRA_|ASYNCIFY|MAIN_MODULE|OPTIMIZE|SUB_OPTIMIZE|INITIAL_MEMORY|MAXIMUM_MEMORY|ASSERTIONS|SYMBOLS|INLINING_LIMIT|SOURCE_MAP_BASE|LTO_FLAG|WASM_BIGINT_FLAG|NODE_RAW_FS|PRELOAD_ASSETS|CONFIGURE_FLAGS|PHP_CONFIGURE_VARS|BUILD_FLAGS|CFLAGS|CXXFLAGS|LDFLAGS)|_(?:REF|REPOSITORY|DEV_PATH|TAG|BRANCH)$/.test(name)).sort(([a], [b]) => a.localeCompare(b));
	const key = digest(JSON.stringify({version, configuration, builderImage, settings, native}));
	const destination = path.resolve(cacheRoot, `php${version}-${key.slice(0, 16)}`);
	const infoPath = path.join(destination, '.build-info.json');
	try
	{
		const previous = JSON.parse(await fs.readFile(infoPath, 'utf8'));
		for(const name of previous.files)
			if(!files.has(name) && allowedSource(name)) await fs.rm(path.join(destination, name), {force: true});
	}
	catch(error) { if(error.code !== 'ENOENT') throw error; }
	await writeSources(destination, files);
	await fs.mkdir(path.join(destination, '.cache'), {recursive: true});
	await fs.writeFile(infoPath, `${JSON.stringify({sourceSha256: digest(JSON.stringify(hashes)), builderImage, files: [...files.keys()]}, null, 2)}\n`);
	return destination;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const [cacheRoot, environment, version, configuration, ...packages] = process.argv.slice(2);
	prepareBuildWorkspace(cacheRoot, environment, version, configuration, packages).then(directory => console.log(directory)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
