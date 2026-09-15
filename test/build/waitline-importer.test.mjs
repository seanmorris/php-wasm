import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testImporter } from './source-importer-contract.mjs';
import { createImporterFixture, importerCase, stateName } from './source-importer-fixture.mjs';

testImporter('waitline');
const { stage, extension } = importerCase('waitline');
const fixture = t => createImporterFixture(t, 'waitline');

test('the immutable default and legacy branch override feed every configure/runtime dependency', t => {
	const f = fixture(t);
	const settings = f.run({ ref: null, goal: 'settings' });
	assert.deepEqual(settings.stdout.trim().split('\n'), [
		'ref=acd126e69f56f281a9dccb0e4eea24786403f46d'
		, ...['configure', 'base', 'cli', 'cgi', 'dbg'].map(name => `${name}=${extension}/${stateName}`)
	]);
	const disabled = f.run({ ref: null, goal: 'settings', enabled: '0' });
	assert.deepEqual(disabled.stdout.trim().split('\n'), ['ref=', 'configure=', 'base=', 'cli=', 'cgi=', 'dbg=']);
	assert.equal(fs.existsSync(path.join(f.workspace, stage)), false);
	f.run({ ref: null, branch: 'legacy-fixture' });
	assert.equal(f.read(`${extension}/waitline.c`), '/* B */\n');
	assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.ref, 'legacy-fixture');
	f.run({ branch: 'legacy-fixture' });
	assert.equal(f.read(`${extension}/waitline.c`), '/* A */\n');
	assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.ref, f.a);
});
