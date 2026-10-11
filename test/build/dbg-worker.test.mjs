import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('worker debugger ships an independent worker loader and its shared base', async () => {
	const pkg = JSON.parse(await fs.readFile('packages/php-dbg-wasm/package.json', 'utf8'));
	assert.ok(pkg.exports['./PhpDbgWorker']);
	const source = await fs.readFile('source/PhpDbgWorker.mjs', 'utf8');
	assert.match(source, /PhpDbgWebBase/);
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
		assert.ok(source.includes(`php${version}-dbg-worker.mjs`));
	assert.doesNotMatch(source, /import\([^)]*-dbg-web/);
	const make = await fs.readFile('packages/php-dbg-wasm/static.mak', 'utf8');
	assert.match(make, /WORKER_DBG_MJS=.*PhpBase\.mjs.*PhpDbgWebBase\.mjs.*PhpDbgWorker\.mjs/);
});

test('debugger asset manifests resolve the actual binary without importing a runtime', async t => {
	const {writeDbgManifest} = await import('../../bin/dbg-assets.mjs');
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbg-assets-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	const filename = path.join(root, 'php8.4-dbg-worker.mjs');
	await fs.writeFile(filename, `throw Error('must not import'); const url = new URL("${'a'.repeat(40)}.wasm", import.meta.url);`);
	await fs.writeFile(path.join(root, `${'a'.repeat(40)}.wasm`), new Uint8Array([0,97,115,109,1,0,0,0]));
	await writeDbgManifest(filename);
	const manifest = JSON.parse(await fs.readFile(filename + '.assets.json'));
	assert.equal(manifest.version, '8.4');
	assert.equal(manifest.environment, 'worker');
	assert.equal(manifest.wasm, `${'a'.repeat(40)}.wasm`);
	assert.equal(manifest.bridgeVersion, 1);
	await assert.rejects(() => writeDbgManifest(path.join(root, 'missing.mjs')));
});

test('native debugger instrumentation is repeatable and fails on an unknown source layout', async () => {
	const {instrumentSource} = await import('../../bin/patch-phpdbg.mjs');
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
{
		for(const name of ['phpdbg.c', 'phpdbg_prompt.c', 'phpdbg_out.c'])
{
			const source = await fs.readFile(`third_party/php${version}-src/sapi/phpdbg/${name}`, 'utf8').catch(() => null);
			if(!source) continue;
			const patched = instrumentSource(name, source);
			assert.equal(instrumentSource(name, patched), patched, `${version}/${name}`);
			assert.match(patched, /phpdbg_wasm_bridge/);
}
}
	assert.throws(() => instrumentSource('phpdbg_prompt.c', 'unknown'), /Unsupported/);
});
