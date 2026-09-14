import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const phpVersions = ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];

// Read-only: tests must consume the final build, never repair or rebuild it.
/**
 * Validates the complete final package inventory without modifying it.
 * @param {string} root Directory containing the final package assets.
 * @param {string} version Expected PHP major.minor version.
 * @returns {object} Verified manifest and resolved artifact paths.
 */
export function readArtifact(root, version)
{
	assert.ok(phpVersions.includes(version), `Unsupported PHP_VERSION: ${version}`);
	const directory = path.resolve(root);
	const manifestName = `php${version}-cloudflare.manifest.json`;
	const manifest = JSON.parse(fs.readFileSync(path.join(directory, manifestName), 'utf8'));
	assert.equal(manifest.schema, 2);
	assert.equal(manifest.packageName, 'php-cloud-wasm');
	assert.equal(manifest.phpVersion, version);
	assert.equal(manifest.entrypoint, `php${version}-cloudflare.mjs`);
	assert.equal(manifest.runtime, `php${version}-cloudflare-runtime.mjs`);
	assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
	const names = new Set;
	for(const file of manifest.files)
	{
		assert.match(file.path, /^[A-Za-z0-9_.-]+$/, 'Only package-root artifact files are accepted');
		assert.ok(file.path !== '.' && file.path !== '..' && !names.has(file.path));
		names.add(file.path);
		const filename = path.join(directory, file.path);
		assert.ok(fs.lstatSync(filename).isFile(), `Missing/non-regular artifact: ${filename}`);
		assert.match(file.sha256, /^[a-f0-9]{64}$/);
		const digest = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
		assert.equal(digest, file.sha256, `Artifact digest mismatch: ${file.path}`);
	}
	assert.ok(names.has(manifest.entrypoint) && names.has(manifest.runtime));
	for(const name of ['package.json', 'README.md', 'LICENSE', 'NOTICE']) assert.ok(names.has(name), `Missing package metadata: ${name}`);
	const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
	assert.equal(pkg.name, 'php-cloud-wasm');
	assert.equal(pkg.type, 'module');
	const entry = fs.readFileSync(path.join(directory, manifest.entrypoint), 'utf8');
	const wasmImports = [...entry.matchAll(/from\s*['"]\.\/([a-f0-9]{40,64}\.wasm)['"]/g)];
	assert.equal(wasmImports.length, 1, 'Public entry must statically import one content-addressed Wasm module');
	const wasm = wasmImports[0][1];
	assert.ok(names.has(wasm), 'Static Wasm import must belong to this manifest');
	const algorithm = wasm.length === 45 ? 'sha1' : 'sha256';
	const contentAddress = createHash(algorithm).update(fs.readFileSync(path.join(directory, wasm))).digest('hex');
	assert.equal(wasm, `${contentAddress}.wasm`, 'Wasm filename must match its contents');
	return { directory, manifestName, manifest, wasm, names };
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
	const [root, version] = process.argv.slice(2);
	const artifact = readArtifact(root, version);
	for(const name of [...artifact.names, artifact.manifestName])
	{
		process.stdout.write(`${path.join(root, name)}\0`);
	}
}
