import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testImporter } from './source-importer-contract.mjs';
import { createImporterFixture, importerCase, stateName } from './source-importer-fixture.mjs';

testImporter('vrzno');

test('JS-only edits rebuild Vrzno and imports include locked build inputs without generated files', t => {
	const f = createImporterFixture(t, 'vrzno');
	const { stage, extension } = importerCase('vrzno');
	fs.mkdirSync(path.join(f.dev, 'generated'));
	fs.writeFileSync(path.join(f.dev, 'generated/vrzno_js.h'), '/* stale generated header */\n');
	f.run({ source: f.dev });
	for(const directory of [stage, extension])
	{
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		for(const name of ['Makefile.frag', 'vrzno_js.h.in', 'vrzno_fetch_js.h.in', 'vrzno_init.js', 'php_stream_fetch_real_open.js', 'vrzno_weakermap.mjs', 'vrzno_bundle.mjs', 'package.json', 'package-lock.json', 'NOTICE'])
			assert.ok(state.files.some(file => file.name === name), name);
		assert.ok(!fs.existsSync(path.join(f.workspace, directory, 'generated')));
		assert.ok(!fs.existsSync(path.join(f.workspace, directory, 'node_modules')));
	}
	fs.appendFileSync(path.join(f.dev, 'vrzno_init.js'), '// JS-only edit\n');
	f.run({ source: f.dev });
	assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(2));
	assert.match(f.read(`${extension}/vrzno_init.js`), /JS-only edit/);
	const before = f.mtimes();
	f.run({ source: f.dev });
	assert.deepEqual(f.mtimes(), before);
	assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(2));
});
