import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import test from 'node:test';

test('nightly indexes discover the live PHP demo and standalone package without browser-barrel exports', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'php-nightly-index-test-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	const tools = path.join(root, 'tools');
	const packages = path.join(root, 'packages');
	await fs.mkdir(tools);
	for(const name of ['php-cloud-wasm', 'browser-library']) await fs.mkdir(path.join(packages, name), {recursive: true});
	const mock = fileURLToPath(new URL('./fixture-command.mjs', import.meta.url));
	for(const name of ['tree', 'brotli', 'gzip'])
		await fs.writeFile(path.join(tools, name), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(mock)} ${name} "$@"\n`, {mode: 0o755});
	const originals = {'runtime.mjs': 'export const answer = 42;\n', 'runtime.wasm': '\0asm fixture', 'index.mjs': '// fixture future index must not enter browser barrel\n'};
	for(const [name, body] of Object.entries(originals)) await fs.writeFile(path.join(packages, 'php-cloud-wasm', name), body);
	await fs.writeFile(path.join(packages, 'browser-library/index.mjs'), 'export const browser = true;\n');
	const script = fileURLToPath(new URL('../../.github/bin/index-dirs.sh', import.meta.url));
	const commandPath = process.env.CLOUDFLARE_INDEX_REAL_TOOLS === '1' ? process.env.PATH : `${tools}${path.delimiter}${process.env.PATH}`;
	const result = spawnSync('bash', [script, packages], {encoding: 'utf8', env: {...process.env, PATH: commandPath}});
	assert.equal(result.status, 0, result.stderr);
	const index = await fs.readFile(path.join(packages, 'index.html'), 'utf8');
	assert.match(index, /php-cloud-wasm/);
	assert.match(index, /href="\/php\/"/);
	assert.match(await fs.readFile(path.join(packages, 'php-cloud-wasm/index.html'), 'utf8'), /href="\/php\/"/);
	const barrel = await fs.readFile(path.join(packages, 'all-libs.mjs'), 'utf8');
	assert.match(barrel, /browser-library/);
	assert.doesNotMatch(barrel, /php-cloud-wasm/);
	for(const [name, body] of Object.entries(originals))
	{
		assert.equal(brotliDecompressSync(await fs.readFile(path.join(packages, 'php-cloud-wasm', name + '.br'))).toString(), body);
		assert.equal(gunzipSync(await fs.readFile(path.join(packages, 'php-cloud-wasm', name + '.gz'))).toString(), body);
	}
});
