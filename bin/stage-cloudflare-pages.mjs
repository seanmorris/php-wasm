#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { verifyCloudflare } from './package-cloudflare.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const PAGES_BUNDLE_LIMIT = 25 * 1024 * 1024;
const multipartAllowance = 64 * 1024;

/** Stage a validated immutable nightly Pages project, without deploying it. */
export async function stageCloudflarePages({artifactRoot = 'packages/php-cloud-wasm', outputDir, phpVersion = '8.5', databaseId, buildId})
{
	if(phpVersion !== '8.5') throw new Error('The nightly Pages demo requires PHP 8.5');
	if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId ?? ''))
		throw new Error('An explicit D1 database UUID is required');
	if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(buildId ?? '') || ['.', '..'].includes(buildId))
		throw new Error('An immutable, single-path-segment build ID is required');
	if(!outputDir) throw new Error('An isolated output directory is required');
	artifactRoot = path.resolve(artifactRoot);
	outputDir = path.resolve(outputDir);
	if(outputDir === artifactRoot || artifactRoot.startsWith(outputDir + path.sep))
		throw new Error('Output must not contain the source artifact directory');
	const {manifest, manifestName} = await verifyCloudflare(artifactRoot, phpVersion);
	const manifestBytes = await fs.readFile(path.join(artifactRoot, manifestName));
	if(JSON.stringify(JSON.parse(manifestBytes)) !== JSON.stringify(manifest)) throw new Error('Artifact manifest changed during staging');
	const phpManifestSha256 = digest(manifestBytes);
	const selected = manifest.files.filter(file => /\.(?:mjs|wasm)$/.test(file.path));
	if(selected.filter(file => file.path.endsWith('.wasm')).length !== 1
		|| selected.some(file => /^php8\./.test(file.path) && !file.path.startsWith(`php${phpVersion}-`)))
		throw new Error('Pages staging requires exactly one PHP version and Wasm module');
	const files = new Map;
	const assets = [];
	for(const file of selected)
	{
		const bytes = await fs.readFile(path.join(artifactRoot, file.path));
		if(digest(bytes) !== file.sha256) throw new Error(`Artifact changed during staging: ${file.path}`);
		files.set(`dist/_worker.js/php-cloud-wasm/${file.path}`, bytes);
		const asset = {path: `/${buildId}/php-cloud-wasm/${file.path}`, sha256: file.sha256, bytes: bytes.length, encodings: {}};
		for(const [encoding, suffix, decompress] of [['br', '.br', brotliDecompressSync], ['gzip', '.gz', gunzipSync]])
		{
			const filename = path.join(artifactRoot, file.path + suffix);
			let stat;
			try { stat = await fs.lstat(filename); }
			catch(error) { if(error.code !== 'ENOENT') throw error; }
			if(!stat)
			{
				if(file.path.endsWith('.wasm') || file.path === manifest.runtime)
					throw new Error(`Missing compressed artifact: ${file.path + suffix}; compress before staging`);
				continue;
			}
			if(!stat.isFile()) throw new Error(`Compressed artifact must be a regular file: ${file.path + suffix}`);
			const compressed = await fs.readFile(filename);
			const decoded = decompress(compressed, {maxOutputLength: bytes.length + 1});
			if(!decoded.equals(bytes)) throw new Error(`Compressed artifact does not match identity: ${file.path + suffix}`);
			asset.encodings[encoding] = {sha256: digest(compressed), bytes: compressed.length};
		}
		assets.push(asset);
	}
	for(const name of ['demo.mjs', 'r2.mjs'])
		files.set(`dist/_worker.js/${name}`, await fs.readFile(path.join(repository, '.cloudflare/pages', name)));
	const build = {buildId, phpVersion, phpManifestSha256};
	files.set('dist/_worker.js/index.js', Buffer.from(`// Generated manifest-only Pages entry; deploy with --no-bundle.\nimport {PhpCloudflare} from './php-cloud-wasm/${manifest.entrypoint}';\nimport {createPagesWorker} from './demo.mjs';\nexport default createPagesWorker(PhpCloudflare, ${JSON.stringify(build)});\n`));
	files.set('dist/_routes.json', Buffer.from('{"version":1,"include":["/*"],"exclude":[]}\n'));
	const configuration = await fs.readFile(path.join(repository, '.cloudflare/pages/wrangler.toml'), 'utf8');
	if(!/binding\s*=\s*['"]NIGHTLY_BUILDS['"]/.test(configuration) || !/cpu_ms\s*=\s*1000\b/.test(configuration))
		throw new Error('Pages source configuration must preserve R2 and the 1000ms CPU limit');
	files.set('wrangler.toml', Buffer.from(`${configuration.trim()}\n\n[[d1_databases]]\nbinding = "NIGHTLY_PHP_DB"\ndatabase_name = "php-wasm-nightly-demo"\ndatabase_id = "${databaseId}"\n`));
	const moduleBytes = [...files].filter(([name]) => name.startsWith('dist/_worker.js/')).reduce((sum, [, bytes]) => sum + bytes.length, 0);
	// Reserve 64KiB plus 1KiB per part for the nested multipart envelope, rather
	// than claiming an exact upload size before the pinned uploader has run.
	const workerBundleBytes = moduleBytes + multipartAllowance + files.size * 1024;
	if(workerBundleBytes > PAGES_BUNDLE_LIMIT) throw new Error(`Pages Worker bundle exceeds 25 MiB: ${workerBundleBytes}`);
	let existing;
	try { existing = await fs.lstat(outputDir); }
	catch(error) { if(error.code !== 'ENOENT') throw error; }
	if(existing && (!existing.isDirectory() || (await fs.readdir(outputDir)).length))
		throw new Error('Output directory must be empty, regular, and isolated');
	await fs.mkdir(outputDir, {recursive: true});
	const inventory = [];
	for(const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b)))
	{
		const filename = path.join(outputDir, name);
		await fs.mkdir(path.dirname(filename), {recursive: true});
		await fs.writeFile(filename, bytes, {flag: 'wx'});
		inventory.push({path: name, sha256: digest(bytes), bytes: bytes.length});
	}
	const staging = {
		schema: 1, ...build, moduleBytes, workerBundleBytes, workerBundleSizeKind: 'conservative-upper-bound'
		, files: inventory, assets
	};
	await fs.writeFile(path.join(outputDir, 'stage.manifest.json'), JSON.stringify(staging, null, 2) + '\n', {flag: 'wx'});
	return staging;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const names = {'--artifact-root': 'artifactRoot', '--output-dir': 'outputDir', '--php-version': 'phpVersion', '--database-id': 'databaseId', '--build-id': 'buildId'};
	const options = {};
	try
	{
		const args = process.argv.slice(2);
		for(let index = 0; index < args.length; index += 2)
		{
			if(!Object.hasOwn(names, args[index]) || !args[index + 1] || args[index + 1].startsWith('--') || Object.hasOwn(options, names[args[index]]))
				throw new Error(`Invalid or duplicate staging option: ${args[index]}`);
			options[names[args[index]]] = args[index + 1];
		}
		stageCloudflarePages(options).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
	}
	catch(error) { console.error(error.message); process.exitCode = 1; }
}
