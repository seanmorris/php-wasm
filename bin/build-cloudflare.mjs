#!/usr/bin/env node
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { packageCloudflare } from './package-cloudflare.mjs';
import { mergeCloudflare } from './merge-cloudflare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versions = new Set(['8.0', '8.1', '8.2', '8.3', '8.4', '8.5']);
const rootFiles = ['Makefile', 'php.mk', 'info.mak', 'ico.ans', 'compress-package.sh', 'emscripten-builder.dockerfile'];
const packageNames = {vrzno: 'vrzno', 'pdo-cfd1': 'pdo-cfd1', zlib: 'php-wasm-zlib', libzip: 'php-wasm-libzip', 'php-cloud-wasm': 'php-cloud-wasm'};
const directories = ['source', 'patch', 'profiles', 'bin', ...Object.keys(packageNames).map(name => `packages/${name}`)];

export async function resolveBuildPackage(folder, sourceRoot = repoRoot)
{
	if(!Object.hasOwn(packageNames, folder)) throw new Error(`Unknown Cloudflare build package: ${folder}`);
	const checkout = path.join(sourceRoot, 'packages', folder);
	try { await fs.lstat(checkout); return checkout; }
	catch(error) { if(error.code !== 'ENOENT') throw error; }
	const require = createRequire(path.join(sourceRoot, 'package.json'));
	return fs.realpath(path.dirname(require.resolve(`${packageNames[folder]}/package.json`)));
}

export function allowedSource(relative)
{
	const parts = relative.split('/');
	if(parts.some(part => part.startsWith('.env') || ['.php-wasm-rc', '.npmrc', '.aws', '.ssh', '.git', 'node_modules', 'mapped'].includes(part))) return false;
	if(/\.(?:pem|key|p12|pfx)$/.test(relative)) return false;
	if(/\.(?:wasm|so|data|dat|log|map|gz|br|BAK)$/.test(relative)) return false;
	if(/^packages\/php-(?:wasm|cloud-wasm|cgi-wasm|cli-wasm|dbg-wasm)\/.+\.(?:mjs|js|manifest\.json)$/.test(relative)) return false;
	if(/^packages\/php-cloud-wasm\/php8\.[0-5]-cloudflare\.d\.mts$/.test(relative)) return false;
	return true;
}

export async function snapshot(destination, sourceRoot = repoRoot)
{
	const hashes = [];
	async function copy(relative, source = path.join(sourceRoot, relative))
	{
		if(!allowedSource(relative)) return;
		const stat = await fs.lstat(source);
		if(stat.isSymbolicLink()) throw new Error(`Build snapshot does not follow symlinks: ${relative}`);
		if(stat.isDirectory())
		{
			for(const name of (await fs.readdir(source)).sort()) await copy(`${relative}/${name}`, path.join(source, name));
			return;
		}
		if(!stat.isFile()) return;
		const data = await fs.readFile(source);
		const target = path.join(destination, relative);
		await fs.mkdir(path.dirname(target), {recursive: true});
		await fs.writeFile(target, data, {mode: stat.mode & 0o777});
		hashes.push([relative, createHash('sha256').update(data).digest('hex')]);
	}
	for(const relative of [...rootFiles, ...directories])
		await copy(relative, relative.startsWith('packages/') ? await resolveBuildPackage(relative.split('/')[1], sourceRoot) : path.join(sourceRoot, relative));
	return createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
}

function docker(args, options = {})
{
	return execFileSync('docker', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options}).trim();
}

export async function buildCloudflare({phpVersion = '8.4', output = path.join(repoRoot, 'packages/php-cloud-wasm'), cacheRoot = path.join(repoRoot, '.cache/cloudflare')} = {})
{
	if(!versions.has(phpVersion)) throw new Error(`Unsupported PHP version: ${phpVersion}`);
	const jobs = Number(process.env.CLOUDFLARE_JOBS ?? Math.min(os.availableParallelism(), 8));
	if(!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 64) throw new Error('CLOUDFLARE_JOBS must be an integer from 1 to 64');
	const diagnosticRoot = path.resolve(cacheRoot);
	await fs.mkdir(diagnosticRoot, {recursive: true});
	const work = await fs.mkdtemp(path.join(diagnosticRoot, `php${phpVersion}-`));
	const source = path.join(work, 'source');
	const assets = path.join(work, 'assets');
	await fs.mkdir(assets);
	const sourceHash = await snapshot(source);
	const image = docker(['image', 'inspect', 'seanmorris/php-emscripten-builder:latest', '--format', '{{.Id}}']);
	const container = `php-wasm-cloudflare-${phpVersion.replace('.', '-')}-${randomUUID().slice(0, 12)}`;
	const command = [
		'emcc --version',
		'emcc --version | head -1 | grep -E "(^|[[:space:]])6[.]0[.]6([[:space:]]|$)"',
		'mkdir -p /src/.cache /src/lib /src/packages/php-cloud-wasm',
		`make _cloudflare-mjs PHP_VERSION=${phpVersion} CPU_COUNT=${jobs} MAX_LOAD=${Math.ceil(jobs * 1.5)} MAKEFLAGS= DOCKER_COMPOSE='node /src/bin/cloudflare-container-run.mjs'`,
	].join('\n');
	let created = false;
	const log = createWriteStream(path.join(work, 'build.log'));
	console.log(`Cloudflare PHP ${phpVersion}: isolated builder ${container}; logs ${work}`);
	try
	{
		docker(['create', '--name', container, '--label', 'php-wasm.profile=cloudflare', '-w', '/src', '-e', 'PHP_WASM_CLOUDFLARE_ISOLATED=1', '-e', `EMCC_CORES=${jobs}`, '-e', `CLOUDFLARE_BUILD_JOBS=${jobs}`, image, 'bash', '-euo', 'pipefail', '-c', command]);
		created = true;
		docker(['cp', `${source}/.`, `${container}:/src`]);
		await new Promise((resolve, reject) => {
			const child = spawn('docker', ['start', '-a', container], {stdio: ['ignore', 'pipe', 'pipe']});
			for(const stream of [child.stdout, child.stderr]) stream.on('data', data => { log.write(data); process.stdout.write(data); });
			child.once('error', reject);
			child.once('close', code => code === 0 ? resolve() : reject(new Error(`Cloudflare build failed (exit ${code}); see ${work}/build.log`)));
		});
		const exitCode = docker(['inspect', container, '--format', '{{.State.ExitCode}}']);
		if(exitCode !== '0') throw new Error(`Cloudflare build failed (exit ${exitCode}); see ${work}/build.log`);
		docker(['cp', `${container}:/src/packages/php-cloud-wasm/.`, assets]);
		const provenance = {profile: 'cloudflare', phpVersion, emscripten: '6.0.6', builderImage: image, sourceSha256: sourceHash, initialMemory: 67108864, maximumMemory: 100663296};
		for(const [name, directory] of [['php', `php${phpVersion}-src`], ['zlib', 'zlib'], ['libzip', 'libzip']])
		{
			const headFile = path.join(work, `${name}-HEAD`);
			docker(['cp', `${container}:/src/third_party/${directory}/.git/HEAD`, headFile]);
			const revision = (await fs.readFile(headFile, 'utf8')).trim();
			if(!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`Expected detached source revision for ${name}`);
			provenance[name] = {revision};
		}
		for(const name of ['vrzno', 'pdo-cfd1'])
		{
			const manifestFile = path.join(work, `${name}-source.json`);
			docker(['cp', `${container}:/src/third_party/${name}/.php-wasm-source.json`, manifestFile]);
			provenance[name] = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
		}
		await packageCloudflare(assets, phpVersion, provenance);
		await mergeCloudflare(path.resolve(output), [assets], {replaceGenerated: true});
		console.log(`Cloudflare PHP ${phpVersion}: final assets ${path.resolve(output)}`);
		return {work, output: path.resolve(output)};
	}
	finally
	{
		log.end();
		if(created)
		{
			try { docker(['cp', `${container}:/src/third_party/php${phpVersion}-src/config.log`, path.join(work, 'config.log')]); } catch { /* Configuration may not have started. */ }
			docker(['rm', '-f', container]);
		}
	}
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const args = process.argv.slice(2);
	const options = {};
	while(args.length)
	{
		const flag = args.shift();
		if(flag === '--php-version' && args.length) options.phpVersion = args.shift();
		else if(flag === '--output' && args.length) options.output = args.shift();
		else if(flag === '--cache-root' && args.length) options.cacheRoot = args.shift();
		else throw new Error(`Unknown or incomplete option: ${flag}`);
	}
	buildCloudflare(options).catch(error => { console.error(error.message); process.exitCode = 1; });
}
