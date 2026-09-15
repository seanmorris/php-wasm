import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRestoredArtifactCache } from './importer-artifact-roundtrip.mjs';
import { createImporterFixture, importerCase, repoRoot, stateName } from './source-importer-fixture.mjs';

/**
 * Exercise the same real Make and package contract for every importer.
 * @param {string} name Extension package name.
 * @returns {void} Registers the package's tests.
 */
export function testImporter(name)
{
	describe(name, () => {
		const spec = importerCase(name);
		const { main, header, other, stage, extension, prefix } = spec;
		const fixture = (t, options) => createImporterFixture(t, name, options);

		test('pinned imports select the exact input inventory and preserve no-op mtimes and build counts', t => {
			const f = fixture(t);
			f.run();
			for(const directory of [stage, extension])
			{
				const state = JSON.parse(f.read(`${directory}/${stateName}`));
				assert.equal(state.schema, 1);
				assert.deepEqual(state.identity, { mode: 'pinned', repository: f.dockerMode ? '/src/pinned-fixture' : f.repository, ref: f.a, commit: f.a });
				assert.deepEqual(state.files.map(file => file.name), Object.keys(f.files).sort());
				for(const [file, contents] of Object.entries(f.files)) assert.equal(f.read(`${directory}/${file}`), contents);
				for(const file of f.excluded) assert.equal(fs.existsSync(path.join(f.workspace, directory, file)), false, file);
			}
			const before = f.mtimes();
			const builds = f.read('build.log');
			f.run();
			assert.deepEqual(f.mtimes(), before);
			assert.equal(f.read('build.log'), builds);
			if(f.dockerMode)
			{
				assert.equal(fs.statSync(path.join(f.workspace, extension)).uid, 0);
				assert.equal(fs.statSync(path.join(f.workspace, extension)).mode & 0o777, 0o755);
				assert.equal(fs.statSync(path.join(f.workspace, stage, stateName)).uid, 0);
				assert.throws(() => fs.writeFileSync(path.join(f.workspace, extension, 'host-write'), ''), { code: 'EACCES' });
			}
		});

		test('a restored artifact cache preserves same-pin inputs and refreshes a changed pin', t => {
			const f = fixture(t);
			assertRestoredArtifactCache(f, { stage, extension, dockerMode: f.dockerMode
				, changedFiles: { [main]: f.files[main], 'config.m4': f.files['config.m4'], ...f.changed } });
		});

		test('A to B to A changes only managed inputs and preserves unrelated files and symlinks', t => {
			const f = fixture(t);
			f.run();
			f.write(`${extension}/preserved.o`, 'object');
			f.write(`${extension}/unmanaged.c`, 'unmanaged');
			f.builder('require("fs").symlinkSync("/unmanaged-target", process.argv[1])', `${extension}/unmanaged-link`);
			f.run({ ref: f.b });
			for(const [file, contents] of Object.entries({ [main]: f.files[main], ...f.changed })) assert.equal(f.read(`${extension}/${file}`), contents);
			assert.equal(fs.existsSync(path.join(f.workspace, extension, 'obsolete.c')), false);
			assert.equal(f.read(`${extension}/added.c`), '/* added B */\n');
			f.run();
			for(const file of [main, ...Object.keys(f.changed)]) assert.equal(f.read(`${extension}/${file}`), f.files[file]);
			assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.commit, f.a);
			assert.equal(fs.existsSync(path.join(f.workspace, extension, 'added.c')), false);
			assert.equal(f.read(`${extension}/preserved.o`), 'object');
			assert.equal(f.read(`${extension}/unmanaged.c`), 'unmanaged');
			assert.equal(fs.readlinkSync(path.join(f.workspace, extension, 'unmanaged-link')), '/unmanaged-target');
			assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(3));
		});

		test('named refs are fetched again when the branch moves', t => {
			const f = fixture(t);
			f.run({ ref: 'legacy-fixture' });
			assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.commit, f.b);
			f.builder('require("child_process").execFileSync("git",["-C",process.argv[1],"update-ref","refs/heads/legacy-fixture",process.argv[2]])',
				f.dockerMode ? '/src/pinned-fixture' : f.repository, f.a);
			f.run({ ref: 'legacy-fixture' });
			assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.commit, f.a);
			for(const file of Object.keys(f.changed)) assert.equal(f.read(`${extension}/${file}`), f.files[file]);
		});

		test('configure and every runtime track the manifest only while the extension is enabled', t => {
			const f = fixture(t);
			const enabled = f.run({ goal: 'dependencies' });
			assert.deepEqual(enabled.stdout.trim().split('\n'), ['configure', 'base', 'cli', 'cgi', 'dbg'].map(target => `${target}=${extension}/${stateName}`));
			const disabled = f.run({ goal: 'dependencies', enabled: '0' });
			assert.deepEqual(disabled.stdout.trim().split('\n'), ['configure=', 'base=', 'cli=', 'cgi=', 'dbg=']);
			assert.equal(fs.existsSync(path.join(f.workspace, stage)), false);
		});

		test('pinned to older dev to same pin restores content; dev snapshots remain external and read-only', t => {
			const f = fixture(t);
			const before = fs.readdirSync(f.dev).map(file => [file, fs.readFileSync(path.join(f.dev, file), 'utf8')]);
			for(const file of fs.readdirSync(f.dev)) fs.utimesSync(path.join(f.dev, file), 1, 1);
			f.run();
			f.run({ source: f.dev });
			assert.equal(f.read(`${extension}/${main}`), '/* DEV */\n');
			assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.path, fs.realpathSync(f.dev));
			for(const file of f.excluded) assert.equal(fs.existsSync(path.join(f.workspace, stage, file)), false, file);
			const unchanged = f.mtimes();
			const builds = f.read('build.log');
			f.run({ source: f.dev });
			assert.deepEqual(f.mtimes(), unchanged);
			assert.equal(f.read('build.log'), builds);
			f.run();
			assert.equal(f.read(`${extension}/${main}`), '/* A */\n');
			assert.deepEqual(fs.readdirSync(f.dev).map(file => [file, fs.readFileSync(path.join(f.dev, file), 'utf8')]), before);
			for(const file of fs.readdirSync(f.dev)) assert.equal(fs.statSync(path.join(f.dev, file)).mtimeMs, 1000);
			if(f.dockerMode) assert.equal(f.builder('process.stdout.write(String(require("fs").existsSync(process.argv[1])))', f.dev), 'false');
		});

		test('an explicit environment development path takes precedence over a pinned ref', t => {
			const f = fixture(t);
			f.run({ environment: { [`${prefix}_DEV_PATH`]: f.dev } });
			assert.equal(f.read(`${extension}/${main}`), '/* DEV */\n');
			f.run();
			assert.equal(f.read(`${extension}/${main}`), '/* A */\n');
		});

		test('included C, headers, configuration and other managed inputs invalidate every translation unit', t => {
			const f = fixture(t);
			f.run({ source: f.dev });
			for(const file of [other, header, 'config.m4', ...Object.keys(spec.extra)])
			{
				const before = f.read('build.log');
				const previous = fs.statSync(path.join(f.dev, file));
				const times = [main, other].map(unit => fs.statSync(path.join(f.workspace, extension, unit), { bigint: true }).mtimeNs);
				fs.writeFileSync(path.join(f.dev, file), `changed ${file}\n`);
				fs.utimesSync(path.join(f.dev, file), previous.atime, previous.mtime);
				f.run({ source: f.dev });
				assert.equal(f.read(`${extension}/${file}`), `changed ${file}\n`);
				assert.equal(f.read('build.log'), before + 'configure\nbuild\n');
				for(const [index, unit] of [main, other].entries()) assert.ok(fs.statSync(path.join(f.workspace, extension, unit), { bigint: true }).mtimeNs > times[index]);
			}
			fs.writeFileSync(path.join(f.dev, 'added.c'), 'added dev');
			fs.unlinkSync(path.join(f.dev, 'obsolete.c'));
			f.run({ source: f.dev });
			for(const directory of [stage, extension])
			{
				assert.equal(f.read(`${directory}/added.c`), 'added dev');
				assert.equal(fs.existsSync(path.join(f.workspace, directory, 'obsolete.c')), false);
			}
		});

		test('unchanged requests repair tampered and missing staged/extension inputs', t => {
			const f = fixture(t);
			f.run();
			f.write(`${stage}/${main}`, 'tampered staging');
			f.write(`${extension}/${header}`, 'tampered extension');
			f.remove(`${extension}/config.m4`);
			f.run();
			assert.equal(f.read(`${stage}/${main}`), '/* A */\n');
			assert.equal(f.read(`${extension}/${header}`), '/* header A */\n');
			assert.equal(f.read(`${extension}/config.m4`), 'dnl A\n');
		});

		test('warm legacy checkouts and corrupt manifests recover without deleting Git metadata', t => {
			const f = fixture(t);
			f.builder(`
const fs = require('fs'), cp = require('child_process');
const [repository, stage, extension, oldCommit] = process.argv.slice(1);
cp.execFileSync('git', ['clone', '--quiet', repository, stage]);
cp.execFileSync('git', ['-C', stage, 'checkout', '--quiet', '-B', 'master', oldCommit]);
fs.cpSync(stage, extension, {recursive:true});
for(const dir of [stage, extension]) {
  fs.writeFileSync(dir+'/removed.c', 'legacy');
  fs.writeFileSync(dir+'/removed.h', 'legacy');
  fs.writeFileSync(dir+'/preserved.o', 'object');
}
fs.writeFileSync('configured', 'legacy');
fs.writeFileSync('runtime', 'legacy');
fs.writeFileSync('build.log', 'legacy\\n');
`, f.dockerMode ? '/src/pinned-fixture' : f.repository, stage, extension, f.a);
			f.run({ ref: f.b });
			assert.equal(f.read('build.log'), 'legacy\nconfigure\nbuild\n');
			for(const directory of [stage, extension])
			{
				for(const [file, contents] of Object.entries(f.changed)) assert.equal(f.read(`${directory}/${file}`), contents);
				assert.equal(fs.existsSync(path.join(f.workspace, directory, 'removed.c')), false);
				assert.equal(fs.existsSync(path.join(f.workspace, directory, 'removed.h')), false);
				assert.equal(f.read(`${directory}/preserved.o`), 'object');
				assert.equal(f.read(`${directory}/.git/HEAD`), 'ref: refs/heads/master\n');
				assert.equal(f.read(`${directory}/.git/refs/heads/master`), f.a + '\n');
				f.write(`${directory}/${stateName}`, '{broken');
				f.write(`${directory}/removed.h`, 'left by interrupted import');
			}
			f.run({ ref: f.b });
			for(const directory of [stage, extension])
			{
				assert.equal(JSON.parse(f.read(`${directory}/${stateName}`)).identity.commit, f.b);
				assert.equal(fs.existsSync(path.join(f.workspace, directory, 'removed.h')), false);
				assert.equal(f.read(`${directory}/preserved.o`), 'object');
				assert.equal(f.read(`${directory}/.git/HEAD`), 'ref: refs/heads/master\n');
				assert.equal(f.read(`${directory}/.git/refs/heads/master`), f.a + '\n');
			}
		});

		test('failed pinned and development input preserves successful sources, manifests and mtimes', t => {
			const f = fixture(t);
			f.run();
			const before = f.mtimes();
			const state = f.read(`${stage}/${stateName}`);
			f.run({ ref: 'does-not-exist', success: false });
			f.run({ origin: `/missing-${name}-repository`, success: false });
			fs.unlinkSync(path.join(f.dev, 'config.m4'));
			f.run({ source: f.dev, success: false });
			assert.deepEqual(f.mtimes(), before);
			assert.equal(f.read(`${stage}/${stateName}`), state);
			assert.equal(f.read(`${extension}/${main}`), '/* A */\n');
		});

		test('an interrupted B import rolls back B-only files using its journal', t => {
			const f = fixture(t);
			f.run();
			f.write(`${extension}/unmanaged.c`, 'unmanaged');
			const previous = f.read(`${extension}/${stateName}`);
			fs.writeFileSync(path.join(f.workspace, 'interrupt.cjs'), `
const fs = require('node:fs');
const rename = fs.renameSync;
fs.renameSync = (source, destination) => {
  if(destination.endsWith('/ext/${spec.extensionName}/${main}')) throw new Error('Injected source-publication failure');
  return rename(source, destination);
};
`);
			const failed = f.run({ ref: f.b, interrupt: true, success: false });
			assert.match(failed.stderr, /Injected source-publication failure/);
			assert.equal(f.read(`${extension}/${stateName}`), previous);
			assert.equal(f.read(`${extension}/added.c`), '/* added B */\n');
			assert.ok(JSON.parse(f.read(`${extension}/.php-wasm-pending.json`)).files.includes('added.c'));
			f.run();
			assert.equal(f.read(`${extension}/${stateName}`), previous);
			assert.equal(fs.existsSync(path.join(f.workspace, extension, 'added.c')), false);
			assert.equal(fs.existsSync(path.join(f.workspace, extension, '.php-wasm-pending.json')), false);
			assert.equal(f.read(`${extension}/${main}`), '/* A */\n');
			assert.equal(f.read(`${extension}/unmanaged.c`), 'unmanaged');
			// Also recover an interruption after manifest publication, before journal removal.
			f.write(`${extension}/.php-wasm-pending.json`, JSON.stringify({ schema: 1, files: [main, 'added.c'] }));
			f.write(`${extension}/added.c`, 'left over');
			f.run();
			assert.equal(fs.existsSync(path.join(f.workspace, extension, 'added.c')), false);
			assert.equal(fs.existsSync(path.join(f.workspace, extension, '.php-wasm-pending.json')), false);
			assert.equal(f.read(`${extension}/unmanaged.c`), 'unmanaged');
		});

		test('source path and repository identity changes are reflected even for equal content', t => {
			const f = fixture(t);
			f.run({ source: f.dev });
			const second = f.dev + '-second';
			fs.cpSync(f.dev, second, { recursive: true });
			f.run({ source: second });
			assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.path, second);
			f.run();
			const alternate = f.dockerMode ? 'file:///src/pinned-fixture' : `file://${f.repository}`;
			f.run({ origin: alternate });
			assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.repository, alternate);
		});

		test('symlinked destinations and overlapping developer checkouts fail before overwrite', t => {
			const f = fixture(t);
			f.run();
			const state = f.read(`${stage}/${stateName}`);
			f.remove(`${extension}/${main}`);
			f.builder('require("fs").symlinkSync(process.argv[1], process.argv[2])', header, `${extension}/${main}`);
			f.run({ success: false });
			assert.equal(f.read(`${extension}/${header}`), '/* header A */\n');
			f.run({ source: path.join(f.workspace, stage), success: false });
			assert.equal(f.read(`${stage}/${stateName}`), state);
		});

		test('the published extension package includes its parameterized command without running scripts', t => {
			const cache = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-pack-cache-`));
			t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
			const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--dry-run', '--json', `./packages/${name}`, '--cache', cache], {
				cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
			}));
			const names = packed[0].files.map(file => file.path);
			for(const file of ['pre.mak', 'static.mak', 'import-source.mjs']) assert.ok(names.includes(file), file);
			assert.ok(!names.includes('compatibility.patch'));
		});

		test('packed builder and extension packages import pinned and development sources in an isolated workspace', t => {
			const f = fixture(t, { installed: true });
			f.run();
			assert.equal(f.read(`${extension}/${main}`), '/* A */\n');
			f.run({ source: f.dev });
			assert.equal(f.read(`${extension}/${main}`), '/* DEV */\n');
			const before = f.mtimes();
			f.run({ source: f.dev });
			assert.deepEqual(f.mtimes(), before);
			// Every package must use the builder's implementation; this also rejects
			// accidentally restoring a self-contained copy of the old importer.
			f.remove('bin/source-importer.mjs');
			const missing = f.run({ success: false });
			assert.match(missing.stderr, /bin\/source-importer\.mjs/);
			assert.deepEqual(f.mtimes(), before);
		});

		if(spec.requiresVrzno) test('enabling the PDO extension explicitly requires Vrzno', t => {
			const f = fixture(t);
			const result = f.run({ goal: 'dependencies', variables: { WITH_VRZNO: '0' }, success: false });
			assert.ok(result.stderr.includes(`WITH_${prefix}=1 requires WITH_VRZNO=1`), result.stderr);
		});
	});
}
