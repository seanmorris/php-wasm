import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import url from 'node:url';
import vm from 'node:vm';

import { transformLogicalAssignments } from '../bin/transform-logical-assignments.mjs';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const commonJsMakefiles = [
	'Makefile'
	, 'packages/php-cgi-wasm/static.mak'
	, 'packages/php-cli-wasm/static.mak'
	, 'packages/php-dbg-wasm/static.mak'
];

test('transforms generated logical assignments without duplicating their targets', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-logical-assignment-'));
	const inputFile = path.join(workspaceDir, 'runtime.js');

	t.after(() => fs.rmSync(workspaceDir, { recursive: true, force: true }));

	fs.writeFileSync(inputFile, [
		'let targetReads=0;'
		, 'const state={};'
		, 'const holder={get target(){targetReads++;return state;}};'
		, 'var listeners=holder.target.listeners??=new Set;'
		, 'let excl;'
		, '(excl||=[]).push("entry");'
		, 'const load=name=>import(/* webpackIgnore: true */ name);'
		, 'require(/* webpackIgnore: true */ "fs");'
		, 'globalThis.result={targetReads,listeners,stateListeners:state.listeners,excl,load};'
	].join('\n'), 'utf8');

	transformLogicalAssignments(inputFile);
	const output = fs.readFileSync(inputFile, 'utf8');

	assert.doesNotMatch(output, /\?\?=|\|\|=/);
	assert.match(output, /webpackIgnore: true/);
	assert.doesNotMatch(output, /var listeners=var listeners=/);

	const context = { require: () => ({}), Set };
	vm.runInNewContext(output, context);

	assert.equal(context.result.targetReads, 1);
	assert.equal(context.result.listeners, context.result.stateListeners);
	assert.equal(context.result.listeners instanceof Set, true);
	assert.deepEqual([...context.result.excl], ['entry']);
});

test('leaves the generated runtime untouched when transformation fails', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-logical-assignment-invalid-'));
	const inputFile = path.join(workspaceDir, 'runtime.js');
	const invalidSource = 'var listeners=this.listeners??=;\n';

	t.after(() => fs.rmSync(workspaceDir, { recursive: true, force: true }));
	fs.writeFileSync(inputFile, invalidSource, 'utf8');

	assert.throws(() => transformLogicalAssignments(inputFile));
	assert.equal(fs.readFileSync(inputFile, 'utf8'), invalidSource);
	assert.deepEqual(fs.readdirSync(workspaceDir), ['runtime.js']);
});

test('all CommonJS build recipes use the syntax-aware transform', () => {
	for(const makefile of commonJsMakefiles)
	{
		const contents = fs.readFileSync(path.join(repoRoot, makefile), 'utf8');
		const transforms = contents.match(/node bin\/transform-logical-assignments\.mjs \$@/g) ?? [];

		assert.equal(transforms.length, 4, makefile);
		assert.doesNotMatch(contents, /\\s\*\\\?\\\?=/);
		assert.doesNotMatch(contents, /\\s\*\\\|\\\|=/);
	}
});
