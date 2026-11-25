import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {missingRuntimeImports} from '../lib/runtime-imports.mjs';

const checker = fileURLToPath(new URL('../lib/runtime-imports.mjs', import.meta.url));

/**
 * Creates a package with lazy ESM and CommonJS factory imports.
 * @param {import('node:test').TestContext} t Test cleanup context.
 * @returns {string} Temporary package directory.
 */
function fixture(t)
{
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-runtime-imports-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
		name: 'runtime-fixture'
		, exports: {'./PhpWorker': {import: './PhpWorker.mjs', require: './PhpWorker.js'}}
	}));
	fs.writeFileSync(path.join(directory, 'PhpWorker.mjs'), 'const a = import(`./php8.0-worker.mjs`); const b = import("./php8.1-worker.mjs");');
	fs.writeFileSync(path.join(directory, 'PhpWorker.js'), 'const a = require("./php8.0-worker.js"); const b = require("./php8.1-worker.js");');
	for(const version of ['8.0', '8.1'])
		for(const format of ['mjs', 'js']) fs.writeFileSync(path.join(directory, `php${version}-worker.${format}`), '');
	return directory;
}

test('public ESM and CommonJS wrappers require every versioned native loader', t => {
	const directory = fixture(t);
	assert.deepEqual(missingRuntimeImports(directory), []);
	fs.unlinkSync(path.join(directory, 'php8.1-worker.mjs'));
	fs.unlinkSync(path.join(directory, 'php8.0-worker.js'));
	assert.deepEqual(missingRuntimeImports(directory), [
		{wrapper: 'PhpWorker.mjs', target: 'php8.1-worker.mjs'}
		, {wrapper: 'PhpWorker.js', target: 'php8.0-worker.js'}
	]);
});

test('npm pack omissions are detected even when files exist in the checkout', t => {
	const directory = fixture(t);
	const files = new Set(fs.readdirSync(directory));
	files.delete('php8.0-worker.mjs');
	assert.deepEqual(missingRuntimeImports(directory, {files}), [
		{wrapper: 'PhpWorker.mjs', target: 'php8.0-worker.mjs'}
	]);
});

test('Babel-transformed lazy imports still require their native loader', t => {
	const directory = fixture(t);
	fs.writeFileSync(path.join(directory, 'PhpWorker.js'), `
const loader = function (specifier) {
	return Promise.resolve(specifier).then(function (s) { return require(s); });
}("./php8.0-worker.js");
`);
	fs.unlinkSync(path.join(directory, 'php8.0-worker.js'));
	assert.deepEqual(missingRuntimeImports(directory), [
		{wrapper: 'PhpWorker.js', target: 'php8.0-worker.js'}
	]);
});

test('single-version artifact checks allow other PHP versions to be absent', t => {
	const directory = fixture(t);
	for(const format of ['mjs', 'js']) fs.unlinkSync(path.join(directory, `php8.1-worker.${format}`));
	assert.deepEqual(missingRuntimeImports(directory, {phpVersion: '8.0'}), []);
	assert.equal(missingRuntimeImports(directory).length, 2);
	execFileSync('node', [checker, '--php-version', '8.0', directory], {stdio: 'pipe'});
	const incomplete = spawnSync('node', [checker, directory], {encoding: 'utf8'});
	assert.equal(incomplete.status, 1);
	assert.match(incomplete.stderr, /php8\.1-worker\.mjs/);
	assert.match(incomplete.stderr, /php8\.1-worker\.js/);
});

test('public wrapper files must also be included in the package', t => {
	const directory = fixture(t);
	const files = new Set(fs.readdirSync(directory));
	files.delete('PhpWorker.js');
	assert.deepEqual(missingRuntimeImports(directory, {files}), [
		{wrapper: 'package.json', target: 'PhpWorker.js'}
	]);
});
