import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const stateName = '.php-wasm-source.json';

/**
 * Snapshot file contents, modes and nanosecond mtimes, excluding ownership.
 * @param {string} workspace Fixture root directory.
 * @param {string[]} roots Relative paths included in the snapshot.
 * @returns {object} File fingerprints keyed by relative path.
 */
function snapshot(workspace, roots)
{
	const files = {};
	const visit = relative => {
		const filename = path.join(workspace, relative);
		const stat = fs.lstatSync(filename, { bigint: true });
		if(stat.isDirectory())
		{
			for(const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));
			return;
		}
		assert.ok(stat.isFile(), `Expected a regular fixture file: ${relative}`);
		files[relative] = {
			hash: createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
			, mode: Number(stat.mode & 0o777n)
			, mtime: stat.mtimeNs.toString()
		};
	};
	for(const relative of roots) visit(relative);
	return files;
}

/**
 * Exercise the real importer across an artifact ownership transition.
 * @param {object} f Importer fixture and its builder helpers.
 * @param {object} options Importer-specific paths and expectations.
 * @param {string} options.stage Staged source directory.
 * @param {string} options.extension PHP extension directory.
 * @param {boolean} options.dockerMode Whether the builder runs as Docker root.
 * @param {object} options.changedFiles Expected source contents at pin B.
 */
export function assertRestoredArtifactCache(f, { stage, extension, dockerMode, changedFiles })
{
	f.run();
	const cacheRoot = `.cache/${path.basename(stage)}-import`;
	const caches = fs.readdirSync(path.join(f.workspace, cacheRoot));
	assert.equal(caches.length, 1, 'The fixture must have one active Git cache');
	assert.match(caches[0], /^[a-f0-9]{64}$/);
	const cache = `${cacheRoot}/${caches[0]}`;
	const cacheSentinel = `${cache}/artifact-sentinel`;
	const stageSentinel = `${stage}/artifact-sentinel.txt`;
	const extensionSentinel = `${extension}/unmanaged.c`;
	f.write(cacheSentinel, 'preserve the existing Git cache\n');
	f.write(stageSentinel, 'preserve unrelated staged files\n');
	f.write(extensionSentinel, 'preserve unrelated extension files\n');

	const roots = ['third_party', '.cache', 'configured', 'runtime', 'build.log'];
	const before = snapshot(f.workspace, roots);
	const sourceBefore = snapshot(f.repository, ['.']);
	const beforeMtimes = f.mtimes();
	const builds = f.read('build.log');
	assert.equal(builds, 'configure\nbuild\n');
	const cacheObjects = Object.keys(before).filter(name => name.startsWith(`${cache}/objects/`));
	assert.ok(cacheObjects.length > 0, 'The archive must contain cached Git objects');
	if(dockerMode) assert.equal(fs.statSync(path.join(f.workspace, cache)).uid, 0);

	// POSIX tar preserves the timestamp precision checked by no-op imports.
	// Only disposable fixture outputs are removed; the input repository and
	// package/Makefile stay in place, keeping the import identity unchanged.
	const archive = path.join(path.dirname(f.workspace), 'importer-artifact.tar');
	execFileSync('tar', ['--format=posix', '-cf', archive, '-C', f.workspace, ...roots]);
	f.builder(`
const fs = require('fs');
for(const relative of process.argv.slice(1)) {
  if(!['third_party', '.cache', 'configured', 'runtime', 'build.log'].includes(relative)) {
    throw new Error('Refusing to remove an unexpected fixture output');
  }
  fs.rmSync(relative, {recursive:true});
}
`, ...roots);
	// The real Docker lane runs this extraction as the nonroot host, not the
	// builder. Restored directories therefore have foreign ownership in Docker.
	execFileSync('tar', ['-xf', archive, '--no-same-owner', '-C', f.workspace]);
	assert.deepEqual(snapshot(f.workspace, roots), before, 'Archive restoration must preserve file data and mtimes');
	if(dockerMode)
	{
		for(const relative of [cache, stage, extension, `${stage}/${stateName}`, `${extension}/${stateName}`])
		{
			assert.equal(fs.statSync(path.join(f.workspace, relative)).uid, process.getuid(), relative);
		}
	}

	f.run();
	assert.deepEqual(snapshot(f.workspace, roots), before, 'Same-pin reimport must preserve the restored artifact and Git cache');
	assert.deepEqual(f.mtimes(), beforeMtimes);
	assert.equal(f.read('build.log'), builds);
	if(dockerMode)
	{
		assert.equal(fs.statSync(path.join(f.workspace, cache)).uid, process.getuid(), 'No-op import must not chown the cache');
	}
	for(const directory of [stage, extension])
	{
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		assert.equal(state.identity.ref, f.a);
		assert.equal(state.identity.commit, f.a);
	}

	f.run({ ref: f.b });
	for(const directory of [stage, extension])
	{
		for(const [name, contents] of Object.entries(changedFiles)) assert.equal(f.read(`${directory}/${name}`), contents);
		assert.equal(f.read(`${directory}/added.c`), '/* added B */\n');
		assert.equal(fs.existsSync(path.join(f.workspace, directory, 'obsolete.c')), false);
		const state = JSON.parse(f.read(`${directory}/${stateName}`));
		assert.equal(state.identity.ref, f.b);
		assert.equal(state.identity.commit, f.b);
		if(dockerMode) assert.equal(fs.statSync(path.join(f.workspace, directory, stateName)).uid, 0);
	}
	assert.equal(f.read(cacheSentinel), 'preserve the existing Git cache\n');
	assert.equal(f.read(stageSentinel), 'preserve unrelated staged files\n');
	assert.equal(f.read(extensionSentinel), 'preserve unrelated extension files\n');
	assert.equal(f.read('build.log'), builds + 'configure\nbuild\n');
	// A changed pin may legitimately repack objects, but both commits must
	// remain usable in the same cache rather than replacing it with a clone.
	f.builder(`
const path = require('path'), cp = require('child_process');
const [relative, ...commits] = process.argv.slice(1);
const cache = path.resolve(relative);
for(const commit of commits) {
  cp.execFileSync('git', ['-c', 'safe.directory='+cache, '-C', cache, 'cat-file', '-e', commit+'^{commit}']);
}
`, cache, f.a, f.b);
	const afterB = snapshot(f.workspace, roots);
	f.run({ ref: f.b });
	assert.deepEqual(snapshot(f.workspace, roots), afterB, 'Repeated B must remain a complete no-op');
	assert.deepEqual(snapshot(f.repository, ['.']), sourceBefore, 'The input repository must stay untouched');
}
