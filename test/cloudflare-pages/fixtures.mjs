import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';

export const digest = data => createHash('sha256').update(data).digest('hex');
export const databaseId = '00000000-0000-4000-8000-000000000042';

/**
 * Creates a small schema2 artifact without requiring native PHP build outputs.
 * @param {import('node:test').TestContext} t Test lifetime.
 * @returns {Promise<object>} Isolated fixture paths and manifest.
 */
export async function artifactFixture(t)
{
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'php-pages-fixture-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	const artifactRoot = path.join(root, 'artifact');
	await fs.mkdir(artifactRoot);
	const wasm = Buffer.from([0,97,115,109,1,0,0,0]);
	const wasmName = createHash('sha1').update(wasm).digest('hex') + '.wasm';
	const entries = {
		[wasmName]: wasm
		, 'php8.5-cloudflare.mjs': `import wasm from './${wasmName}'; export class PhpCloudflare {}\n`
		, 'php8.5-cloudflare-runtime.mjs': `export const wasmFile = '${wasmName}'; export default function() {}\n`
		, 'package.json': JSON.stringify({name: 'php-cloud-wasm', type: 'module'})
		, 'README.md': 'fixture package'
		, LICENSE: 'fixture license'
		, NOTICE: 'fixture notice'
	};
	for(const name of ['PhpCloudflare', 'PhpBase', 'OutputBuffer', '_Event', 'fsOps', 'resolveDependencies']) entries[`${name}.mjs`] = 'export {};\n';
	for(const name of ['php8.5-cloudflare.d.mts', 'PhpCloudflare.d.mts', 'PhpBase.d.mts', 'public.d.ts']) entries[name] = 'export {};\n';
	const manifest = {schema: 2, packageName: 'php-cloud-wasm', phpVersion: '8.5', entrypoint: 'php8.5-cloudflare.mjs', runtime: 'php8.5-cloudflare-runtime.mjs', provenance: {fixture: true}, files: []};
	for(const [name, value] of Object.entries(entries))
	{
		const bytes = Buffer.from(value);
		await fs.writeFile(path.join(artifactRoot, name), bytes);
		manifest.files.push({path: name, sha256: digest(bytes), bytes: bytes.length});
		if(/\.(?:mjs|wasm)$/.test(name))
		{
			await fs.writeFile(path.join(artifactRoot, name + '.gz'), gzipSync(bytes));
			await fs.writeFile(path.join(artifactRoot, name + '.br'), brotliCompressSync(bytes));
		}
	}
	const manifestPath = path.join(artifactRoot, 'php8.5-cloudflare.manifest.json');
	await fs.writeFile(manifestPath, JSON.stringify(manifest));
	return {root, artifactRoot, manifest, manifestPath, wasmName, options: {artifactRoot, outputDir: path.join(root, 'stage'), databaseId, buildId: 'fixture-build', phpVersion: '8.5'}};
}
