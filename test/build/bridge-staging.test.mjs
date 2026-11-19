import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import makeEnvironment from '../../bin/make-environment.cjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

for(const [packageName, sourceName, buildName] of [
	['vrzno', 'vrzno', 'vrzno']
	, ['waitline', 'waitline', 'waitline']
	, ['pdo-pglite', 'pdo_pglite', 'pdo-pglite']
]){
	test(`${packageName} stages changed source once and preserves incremental build output`, t => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-bridge-staging-'));
		t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
		const source = path.join(directory, `third_party/php8.4-src/ext/${sourceName}`);
		const output = path.join(directory, `third_party/php8.4-${buildName}`);
		const stamp = path.join(source, '.php-wasm-source.json');
		const sourceStamp = path.join(directory, `third_party/${packageName}/.php-wasm-source.json`);
		const phpSourceMarker = path.join(directory, 'third_party/php8.4-src/.gitignore');
		const target = path.join(output, 'config.m4');
		const sentinel = path.join(output, 'compiled.o');
		const docker = path.join(directory, 'docker-run.cjs');
		fs.mkdirSync(source, {recursive: true});
		fs.mkdirSync(path.dirname(sourceStamp), {recursive: true});
		fs.writeFileSync(path.join(source, 'config.m4'), 'original');
		fs.writeFileSync(stamp, '{}');
		fs.writeFileSync(sourceStamp, '{}');
		fs.writeFileSync(phpSourceMarker, '');
		fs.utimesSync(path.join(source, 'config.m4'), 1, 1);
		fs.utimesSync(stamp, 2, 2);
		// Run the actual copy/delete/touch recipes with paths mapped to this fixture.
		fs.writeFileSync(docker, `
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2).map(arg => arg.replace(/^\\/src\\//, ${JSON.stringify(`${directory}/`)}));
if(args[0] === 'node' && args[2] === 'sync') process.exit(0);
const result = spawnSync(args[0], args.slice(1), {stdio: 'inherit'});
process.exit(result.status ?? 1);
`);
		const build = () => execFileSync('make', [
			'--no-print-directory'
			, '-f'
			, path.join(root, `packages/${packageName}/static.mak`)
			, 'PHP_VERSION=8.4', `DOCKER_RUN=node ${docker}`
			, `--old-file=${path.relative(directory, sourceStamp)}`
			, `--old-file=${path.relative(directory, phpSourceMarker)}`
			, path.relative(directory, target)
		], {cwd: directory, env: makeEnvironment.independentMakeEnvironment(), stdio: 'pipe'});
		build();
		fs.writeFileSync(sentinel, 'compiled');
		build();
		assert.ok(fs.existsSync(sentinel), 'unchanged staging removed compiled output');
		assert.equal(fs.readFileSync(sentinel, 'utf8'), 'compiled');
		fs.writeFileSync(path.join(source, 'config.m4'), 'updated');
		fs.utimesSync(target, 1, 1);
		fs.utimesSync(stamp, 2, 2);
		build();
		assert.equal(fs.existsSync(sentinel), false, 'changed source did not replace the build tree');
		assert.equal(fs.readFileSync(target, 'utf8'), 'updated');
		fs.writeFileSync(sentinel, 'rebuilt');
		build();
		assert.ok(fs.existsSync(sentinel), 're-staged source remained out of date');
		assert.equal(fs.readFileSync(sentinel, 'utf8'), 'rebuilt');
	});
}
