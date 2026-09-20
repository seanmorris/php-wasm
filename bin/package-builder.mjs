#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {snapshot} from './prepare-build-workspace.mjs';

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helpers = [
	'retry-download.sh', 'retry-embuilder.sh', 'verify-emscripten-profile-runtime.sh'
	, 'verify-emscripten-fibers.sh', 'verify-emscripten-async-errors.sh'
];
const commands = new Set([
	'php-wasm-builder.js', 'make-environment.cjs', 'source-importer.mjs'
	, 'list-extension-packages.mjs'
	, 'prepare-build-workspace.mjs', 'package-builder.mjs', 'package-cloudflare.mjs'
	, 'merge-cloudflare.mjs', 'generate-runtime-types.mjs', 'transform-logical-assignments.mjs'
]);
const supplemental = [
	'LICENSE', 'LICENSE-GPL', 'NOTICE', 'README.md', 'hash-wasms.sh', 'remap-sourcemap.sh'
	, ...helpers.map(name => `.github/bin/${name}`)
];

/**
 * Packs the build sources and local package templates without native outputs.
 * Compilation and image construction remain ordinary Make targets.
 * @param {object} [options] Source and artifact directories.
 * @param {string} [options.sourceRoot] Builder checkout or installed source package.
 * @param {string} [options.outputDir] Directory receiving the tarball and manifest.
 * @returns {Promise<object>} Verified package inventory and content digest.
 */
export async function packageBuilder({sourceRoot = repoRoot, outputDir = path.join(repoRoot, '.cache/release')} = {})
{
	sourceRoot = path.resolve(sourceRoot);
	outputDir = path.resolve(outputDir);
	await fs.mkdir(outputDir, {recursive: true});
	const staging = await fs.mkdtemp(path.join(outputDir, 'builder-stage-'));
	try
	{
		const sourceSha256 = await snapshot(staging, sourceRoot);
		for(const name of supplemental)
		{
			const target = path.join(staging, name);
			await fs.mkdir(path.dirname(target), {recursive: true});
			await fs.copyFile(path.join(sourceRoot, name), target);
		}
		for(const name of await fs.readdir(path.join(staging, 'bin')))
		{
			if(!commands.has(name)) await fs.rm(path.join(staging, 'bin', name), {recursive: true});
		}
		const metadata = JSON.parse(await fs.readFile(path.join(staging, 'package.json'), 'utf8'));
		metadata.files = [
			'Makefile', '*.mak', 'php.mk', 'ico.ans', '*.sh', '*.dockerfile', 'docker-compose.yml'
			, '.babelrc', 'bin/', 'source/', 'patch/', 'profiles/', 'packages/'
			, ...supplemental
		];
		await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
		const {stdout} = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', outputDir], {
			cwd: staging, maxBuffer: 16 * 1024 * 1024
		});
		const [packed] = JSON.parse(stdout);
		const files = packed.files.map(file => file.path);
		for(const directory of Object.values(metadata.dependencies).filter(value => value.startsWith('./packages/')))
		{
			if(!files.includes(`${directory.slice(2)}/package.json`)) throw new Error(`Missing builder dependency: ${directory}`);
		}
		for(const name of [...supplemental, 'bin/php-wasm-builder.js', 'packages/php-cgi-wasm/static.mak'])
		{
			if(!files.includes(name)) throw new Error(`Missing builder input: ${name}`);
		}
		const artifact = path.join(outputDir, packed.filename);
		const result = {
			name: packed.name, version: packed.version, filename: packed.filename, sourceSha256
			, sha256: createHash('sha256').update(await fs.readFile(artifact)).digest('hex')
			, size: packed.size, files
		};
		await fs.writeFile(path.join(outputDir, 'builder.manifest.json'), JSON.stringify(result, null, 2) + '\n');
		return result;
	}
	finally
	{
		await fs.rm(staging, {recursive: true, force: true});
	}
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	packageBuilder({outputDir: process.argv[2]}).then(result => {
		console.log(`${result.filename}: ${result.size} bytes, sha256 ${result.sha256}`);
	}).catch(error => {console.error(error.message); process.exitCode = 1;});
}
