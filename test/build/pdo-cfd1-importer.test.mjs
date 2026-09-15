import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testImporter } from './source-importer-contract.mjs';
import { createImporterFixture, importerCase, stateName } from './source-importer-fixture.mjs';

testImporter('pdo-cfd1');
const { stage, extension } = importerCase('pdo-cfd1');
const fixture = t => createImporterFixture(t, 'pdo-cfd1');

test('restored patch identities migrate even when upstream source bytes are unchanged', t => {
	const f = fixture(t);
	f.run();
	for(const directory of [stage, extension])
	{
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		state.identity.patch = 'a'.repeat(64);
		f.write(`${directory}/${stateName}`, JSON.stringify(state));
	}
	f.run();
	for(const directory of [stage, extension])
	{
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		assert.equal(state.identity.commit, f.a);
		assert.ok(!Object.hasOwn(state.identity, 'patch'));
		assert.equal(f.read(`${directory}/pdo_cfd1.c`), '/* A */\n');
	}
	assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(2));
	const before = f.mtimes();
	f.run();
	assert.deepEqual(f.mtimes(), before);
	assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(2));
});

test('switching from cached patched inputs imports raw upstream files and removes only managed patch files', t => {
	const f = fixture(t);
	f.run();
	const patched = '/* old patched entry point */\n';
	const obsolete = '/* retired patch helper */\n';
	for(const directory of [stage, extension])
	{
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		state.identity.patch = 'a'.repeat(64);
		state.files.find(file => file.name === 'pdo_cfd1.c').sha256 = createHash('sha256').update(patched).digest('hex');
		state.files.push({ name: 'php_wasm_compatibility.h', sha256: createHash('sha256').update(obsolete).digest('hex') });
		f.write(`${directory}/pdo_cfd1.c`, patched);
		f.write(`${directory}/php_wasm_compatibility.h`, obsolete);
		f.write(`${directory}/unmanaged.c`, 'preserved');
		f.write(`${directory}/${stateName}`, JSON.stringify(state));
	}
	f.run({ ref: f.b });
	for(const directory of [stage, extension])
	{
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		assert.equal(state.identity.commit, f.b);
		assert.ok(!Object.hasOwn(state.identity, 'patch'));
		assert.equal(f.read(`${directory}/pdo_cfd1.c`), '/* A */\n');
		assert.equal(f.read(`${directory}/php_pdo_cfd1.h`), '/* header B */\n');
		assert.equal(f.read(`${directory}/unmanaged.c`), 'preserved');
		assert.ok(!fs.existsSync(path.join(f.workspace, directory, 'php_wasm_compatibility.h')));
	}
	assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(2));
});
