import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readArtifact } from './artifacts.mjs';

/**
 * Creates a small independent artifact; no PHP compiler or runtime is required.
 * @param {import('node:test').TestContext} context Test owning the temporary directory.
 * @returns {{root: string, manifest: object, manifestPath: string}} Fixture inventory.
 */
function fixture(context)
{
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'php-cloudflare-manifest-'));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
	const wasmName = `${createHash('sha1').update(wasm).digest('hex')}.wasm`;
	const files = {
		'php8.3-cloudflare.mjs': `import wasm from './${wasmName}'; export { wasm };`
		, 'php8.3-cloudflare-runtime.mjs': 'export default () => {};'
		, [wasmName]: wasm
		, 'package.json': JSON.stringify({name: 'php-cloud-wasm', type: 'module'})
		, 'README.md': 'Fixture package documentation'
		, 'LICENSE': 'Fixture license'
		, 'NOTICE': 'Fixture notice'
	};
	const manifest = {
		schema: 2
		, packageName: 'php-cloud-wasm'
		, phpVersion: '8.3'
		, entrypoint: 'php8.3-cloudflare.mjs'
		, runtime: 'php8.3-cloudflare-runtime.mjs'
		, provenance: { fixture: true }
		, files: Object.entries(files).map(([name, contents]) => {
			fs.writeFileSync(path.join(root, name), contents);
			return { path: name, sha256: createHash('sha256').update(contents).digest('hex') };
		})
	};
	const manifestPath = path.join(root, 'php8.3-cloudflare.manifest.json');
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	return { root, manifest, manifestPath };
}

test('accepts the exact final entry, factory and statically imported hashed Wasm', context => {
	const { root } = fixture(context);
	const artifact = readArtifact(root, '8.3');
	assert.equal(artifact.names.size, 7);
	assert.match(artifact.wasm, /^[a-f0-9]{40}\.wasm$/);
});

test('rejects missing artifacts instead of rebuilding or skipping', context => {
	const { root } = fixture(context);
	fs.unlinkSync(path.join(root, 'php8.3-cloudflare-runtime.mjs'));
	assert.throws(() => readArtifact(root, '8.3'), /ENOENT/);
});

test('rejects stale or modified JavaScript/Wasm pairs', context => {
	const { root } = fixture(context);
	fs.appendFileSync(path.join(root, 'php8.3-cloudflare-runtime.mjs'), '\n// stale');
	assert.throws(() => readArtifact(root, '8.3'), /digest mismatch/);
});

test('rejects an unexpected PHP version in the manifest', context => {
	const { root, manifest, manifestPath } = fixture(context);
	manifest.phpVersion = '8.4';
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	assert.throws(() => readArtifact(root, '8.3'));
});

test('rejects path traversal and duplicate inventory entries', context => {
	const { root, manifest, manifestPath } = fixture(context);
	manifest.files.push({ path: '../outside', sha256: '0'.repeat(64) });
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	assert.throws(() => readArtifact(root, '8.3'), /package-root/);
	manifest.files.pop();
	manifest.files.push(manifest.files[0]);
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	assert.throws(() => readArtifact(root, '8.3'));
});

test('rejects symlinked asset files', context => {
	const { root } = fixture(context);
	const runtime = path.join(root, 'php8.3-cloudflare-runtime.mjs');
	fs.renameSync(runtime, path.join(root, 'real-runtime.mjs'));
	fs.symlinkSync('real-runtime.mjs', runtime);
	assert.throws(() => readArtifact(root, '8.3'), /non-regular artifact/);
});
