import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerMode = process.env.PDO_PGLITE_IMPORTER_DOCKER === '1';
const image = process.env.PDO_PGLITE_IMPORTER_IMAGE ?? 'php-wasm-vrzno-importer';
const extension = 'third_party/php8.3-src/ext/pdo_pglite';
const stage = 'third_party/pdo-pglite';
const stateName = '.php-wasm-source.json';
const quote = value => `'${String(value).replaceAll("'", "'\"'\"'")}'`;

if(dockerMode)
{
	assert.notEqual(process.getuid?.(), 0, 'Docker ownership tests require a nonroot host process');
	execFileSync('docker', ['info'], { stdio: 'ignore' });
}

/**
 * Create a disposable workspace using the shipped Makefiles and helper.
 * @param {object} t Node test context.
 * @param {object} [options] Fixture options.
 * @param {boolean} [options.installed] Extract a real npm package first.
 * @returns {object} Workspace controls and fixture identities.
 */
function fixture(t, { installed = false } = {})
{
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pdo-pglite-importer-'));
	const workspace = path.join(temporary, 'workspace');
	const repository = path.join(temporary, 'repository');
	const dev = path.join(temporary, "dev source's checkout");
	for(const directory of [workspace, repository, dev]) fs.mkdirSync(directory);
	const packageRelative = installed ? 'node_modules/pdo-pglite' : 'packages/pdo-pglite';
	const packagePath = path.join(workspace, packageRelative);
	fs.mkdirSync(packagePath, { recursive: true });
	if(installed)
	{
		const packed = JSON.parse(execFileSync('npm', ['pack', '--json', path.join(repoRoot, 'packages/pdo-pglite'), '--pack-destination', temporary, '--cache', path.join(temporary, '.npm-cache')], {
			cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
		}));
		execFileSync('tar', ['-xzf', path.join(temporary, packed[0].filename), '-C', packagePath, '--strip-components=1']);
	}
	else
	{
		for(const name of ['pre.mak', 'static.mak', 'import-source.mjs', 'package.json'])
		{
			fs.copyFileSync(path.join(repoRoot, 'packages/pdo-pglite', name), path.join(packagePath, name));
		}
	}
	const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '--quiet');
	git('config', 'user.email', 'importer-test@example.invalid');
	git('config', 'user.name', 'Importer test');
	const files = {
		'pdo_pglite.c': '/* A */\n'
		, 'config.m4': 'dnl A\n'
		, 'php_pdo_pglite.h': '/* header A */\n'
		, 'pdo_pglite_db.c': '/* other A */\n'
		, 'obsolete.c': '/* obsolete */\n'
		, 'config.w32': '// Windows config A\n'
		, 'README.md': 'README A\n'
		, 'CREDITS': 'PGlite\nTest authors\n'
		, 'LICENSE': 'Test license\n'
	};
	for(const [name, contents] of Object.entries(files))
	{
		fs.writeFileSync(path.join(repository, name), contents);
		fs.writeFileSync(path.join(dev, name), contents.replaceAll('A', 'DEV'));
	}
	fs.writeFileSync(path.join(dev, '.env'), 'DO_NOT_COPY=fixture\n');
	git('add', '.');
	git('commit', '--quiet', '-m', 'A');
	const a = git('rev-parse', 'HEAD');
	// Keep the translation-unit entry point and configure script unchanged.
	// PDO PGlite includes the database C files from its main translation unit.
	fs.writeFileSync(path.join(repository, 'pdo_pglite_db.c'), '/* other B */\n');
	fs.writeFileSync(path.join(repository, 'php_pdo_pglite.h'), '/* header B */\n');
	fs.unlinkSync(path.join(repository, 'obsolete.c'));
	fs.writeFileSync(path.join(repository, 'added.c'), '/* added B */\n');
	git('add', '-A');
	git('commit', '--quiet', '-m', 'B');
	const b = git('rev-parse', 'HEAD');
	const dockerPrefix = ['run', '--rm', '-i', '--user', '0:0'
		, '--mount', `type=bind,src=${workspace},dst=/src`
		, '--mount', `type=bind,src=${repository},dst=/pdo-pglite-fixture,readonly`
		, '-w', '/src', image];
	const dockerRun = dockerMode ? ['docker', ...dockerPrefix].map(quote).join(' ') : '';
	const builder = (script, ...args) => execFileSync(dockerMode ? 'docker' : process.execPath,
		dockerMode ? [...dockerPrefix, 'node', '-e', script, ...args] : ['-e', script, ...args],
		{ cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	t.after(() => {
		if(dockerMode)
		{
			execFileSync('docker', [...dockerPrefix, 'chown', '-R', `${process.getuid()}:${process.getgid()}`, '/src']);
		}
		fs.rmSync(temporary, { recursive: true, force: true });
	});
	// The local Git server fixture has builder ownership. It is separate from
	// the nonroot host's read-only checkout, and needs no safe.directory bypass.
	if(dockerMode) builder('require("fs").cpSync("/pdo-pglite-fixture","pinned-fixture",{recursive:true})');
	fs.writeFileSync(path.join(workspace, 'Makefile'), `
.DEFAULT_GOAL := all
PHP_VERSION := 8.3
include ${packageRelative}/pre.mak
include ${packageRelative}/static.mak
.PHONY: all
all: runtime ${stage}/pdo_pglite.c ${extension}/config.m4 ${extension}/pdo_pglite.c
third_party/php8.3-src/.gitignore:
\t@\${DOCKER_RUN} node -e "const fs=require('fs');fs.mkdirSync('third_party/php8.3-src/ext',{recursive:true});fs.writeFileSync('third_party/php8.3-src/.gitignore','');"
configured: \${PHP_CONFIGURE_DEPS}
\t@\${DOCKER_RUN} node -e "const fs=require('fs');fs.appendFileSync('build.log','configure\\n');fs.writeFileSync('configured','');"
runtime: configured \${DEPENDENCIES}
\t@\${DOCKER_RUN} node -e "const fs=require('fs');fs.appendFileSync('build.log','build\\n');fs.writeFileSync('runtime','');"
dependencies:
\t@printf '%s\\n' 'configure=\${PHP_CONFIGURE_DEPS}' 'base=\${DEPENDENCIES}' 'cli=\${CLI_DEPENDENCIES}' 'cgi=\${CGI_DEPENDENCIES}' 'dbg=\${DBG_DEPENDENCIES}'
`);
	const run = ({ ref = a, source, origin, success = true, interrupt = false, goal = 'all', enabled = '1' } = {}) => {
		const preload = dockerMode ? '/src/interrupt.cjs' : path.join(workspace, 'interrupt.cjs');
		const prefix = dockerRun + (interrupt ? ` env ${quote(`NODE_OPTIONS=--require ${preload}`)}` : '');
		const result = spawnSync('make', [
			'--no-print-directory'
			, '-j4'
			, goal
			, `DOCKER_RUN=${prefix}`
			, `WITH_PDO_PGLITE=${enabled}`
			, `PDO_PGLITE_REPOSITORY=${origin ?? (dockerMode ? '/src/pinned-fixture' : repository)}`
			, `PDO_PGLITE_REF=${ref}`
			, ...(source ? [`PDO_PGLITE_DEV_PATH=${source}`] : [])
		], { cwd: workspace, encoding: 'utf8' });
		if(success) assert.equal(result.status, 0, result.stdout + result.stderr);
		else assert.notEqual(result.status, 0, 'Expected import to fail');
		return result;
	};
	const read = relative => fs.readFileSync(path.join(workspace, relative), 'utf8');
	const write = (relative, contents) => builder('require("fs").writeFileSync(process.argv[1],process.argv[2])', relative, contents);
	const remove = relative => builder('require("fs").unlinkSync(process.argv[1])', relative);
	const mtimes = () => Object.fromEntries([stage, extension].flatMap(directory =>
		fs.readdirSync(path.join(workspace, directory)).filter(name => !name.startsWith('.php-wasm-import-'))
			.map(name => [`${directory}/${name}`, fs.statSync(path.join(workspace, directory, name), { bigint: true }).mtimeNs.toString()])));
	return { workspace, repository, dev, a, b, run, read, write, remove, builder, mtimes };
}

test('real Make imports pinned sources and preserves all no-op mtimes and downstream build counts', t => {
	const f = fixture(t);
	f.run();
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
	assert.equal(f.read(`${extension}/CREDITS`), 'PGlite\nTest authors\n');
	const before = f.mtimes();
	const builds = f.read('build.log');
	f.run();
	assert.deepEqual(f.mtimes(), before);
	assert.equal(f.read('build.log'), builds);
	if(dockerMode)
	{
		assert.equal(fs.statSync(path.join(f.workspace, extension)).uid, 0);
		assert.equal(fs.statSync(path.join(f.workspace, extension)).mode & 0o777, 0o755);
		assert.equal(fs.statSync(path.join(f.workspace, stage, stateName)).uid, 0);
		assert.throws(() => fs.writeFileSync(path.join(f.workspace, extension, 'host-write'), ''), { code: 'EACCES' });
	}
});

test('A to B to A selects actual source bytes and deletes only previously managed inputs', t => {
	const f = fixture(t);
	f.run();
	f.write(`${extension}/preserved.o`, 'object');
	f.write(`${extension}/unmanaged.c`, 'unmanaged');
	f.builder('require("fs").symlinkSync("/unmanaged-target", process.argv[1])', `${extension}/unmanaged-link`);
	f.run({ ref: f.b });
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
	assert.equal(f.read(`${extension}/pdo_pglite_db.c`), '/* other B */\n');
	assert.equal(f.read(`${extension}/php_pdo_pglite.h`), '/* header B */\n');
	assert.equal(fs.existsSync(path.join(f.workspace, extension, 'obsolete.c')), false);
	assert.equal(f.read(`${extension}/added.c`), '/* added B */\n');
	f.run();
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
	assert.equal(f.read(`${extension}/pdo_pglite_db.c`), '/* other A */\n');
	assert.equal(f.read(`${extension}/php_pdo_pglite.h`), '/* header A */\n');
	assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.commit, f.a);
	assert.equal(fs.existsSync(path.join(f.workspace, extension, 'added.c')), false);
	assert.equal(f.read(`${extension}/preserved.o`), 'object');
	assert.equal(f.read(`${extension}/unmanaged.c`), 'unmanaged');
	assert.equal(fs.readlinkSync(path.join(f.workspace, extension, 'unmanaged-link')), '/unmanaged-target');
	assert.equal(f.read('build.log'), 'configure\nbuild\n'.repeat(3));
});

test('configure and every runtime track the manifest only while PGlite is enabled', t => {
	const f = fixture(t);
	const enabled = f.run({ goal: 'dependencies' });
	assert.deepEqual(enabled.stdout.trim().split('\n'), ['configure', 'base', 'cli', 'cgi', 'dbg'].map(name => `${name}=${extension}/${stateName}`));
	const disabled = f.run({ goal: 'dependencies', enabled: '0' });
	assert.deepEqual(disabled.stdout.trim().split('\n'), ['configure=', 'base=', 'cli=', 'cgi=', 'dbg=']);
	assert.equal(fs.existsSync(path.join(f.workspace, stage)), false);
});

test('pinned to older dev to same pin restores content; dev snapshots are external and read-only', t => {
	const f = fixture(t);
	const before = fs.readdirSync(f.dev).map(name => [name, fs.readFileSync(path.join(f.dev, name), 'utf8')]);
	for(const name of fs.readdirSync(f.dev)) fs.utimesSync(path.join(f.dev, name), 1, 1);
	f.run();
	f.run({ source: f.dev });
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* DEV */\n');
	assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.path, fs.realpathSync(f.dev));
	assert.equal(fs.existsSync(path.join(f.workspace, stage, '.env')), false);
	const unchanged = f.mtimes();
	const builds = f.read('build.log');
	f.run({ source: f.dev });
	assert.deepEqual(f.mtimes(), unchanged);
	assert.equal(f.read('build.log'), builds);
	f.run();
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
	assert.deepEqual(fs.readdirSync(f.dev).map(name => [name, fs.readFileSync(path.join(f.dev, name), 'utf8')]), before);
	for(const name of fs.readdirSync(f.dev)) assert.equal(fs.statSync(path.join(f.dev, name)).mtimeMs, 1000);
	if(dockerMode) assert.equal(f.builder('process.stdout.write(String(require("fs").existsSync(process.argv[1])))', f.dev), 'false');
});

test('included C, header, config, README, addition and deletion changes refresh both inputs and downstream Make targets', t => {
	const f = fixture(t);
	f.run({ source: f.dev });
	for(const name of ['pdo_pglite_db.c', 'php_pdo_pglite.h', 'config.m4', 'config.w32', 'README.md'])
	{
		const before = f.read('build.log');
		const previous = fs.statSync(path.join(f.dev, name));
		const mainTime = fs.statSync(path.join(f.workspace, extension, 'pdo_pglite.c'), { bigint: true }).mtimeNs;
		fs.writeFileSync(path.join(f.dev, name), `changed ${name}\n`);
		fs.utimesSync(path.join(f.dev, name), previous.atime, previous.mtime);
		f.run({ source: f.dev });
		assert.equal(f.read(`${extension}/${name}`), `changed ${name}\n`);
		assert.equal(f.read('build.log'), before + 'configure\nbuild\n');
		assert.ok(fs.statSync(path.join(f.workspace, extension, 'pdo_pglite.c'), { bigint: true }).mtimeNs > mainTime);
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
	f.write(`${stage}/pdo_pglite.c`, 'tampered staging');
	f.write(`${extension}/php_pdo_pglite.h`, 'tampered extension');
	f.remove(`${extension}/config.m4`);
	f.run();
	assert.equal(f.read(`${stage}/pdo_pglite.c`), '/* A */\n');
	assert.equal(f.read(`${extension}/php_pdo_pglite.h`), '/* header A */\n');
	assert.equal(f.read(`${extension}/config.m4`), 'dnl A\n');
});

test('legacy imports and corrupt manifests recover using only the managed input classes', t => {
	const f = fixture(t);
	f.builder('const fs=require("fs");for(const dir of process.argv.slice(1)){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+"/removed.c","legacy");fs.writeFileSync(dir+"/removed.h","legacy");fs.writeFileSync(dir+"/preserved.o","object");fs.mkdirSync(dir+"/.git");fs.writeFileSync(dir+"/.git/keep","git metadata");}', stage, extension);
	f.run();
	for(const directory of [stage, extension])
	{
		assert.equal(fs.existsSync(path.join(f.workspace, directory, 'removed.c')), false);
		assert.equal(fs.existsSync(path.join(f.workspace, directory, 'removed.h')), false);
		assert.equal(f.read(`${directory}/preserved.o`), 'object');
		assert.equal(f.read(`${directory}/.git/keep`), 'git metadata');
		f.write(`${directory}/${stateName}`, '{broken');
		f.write(`${directory}/removed.h`, 'left by interrupted import');
	}
	f.run();
	for(const directory of [stage, extension])
	{
		assert.equal(JSON.parse(f.read(`${directory}/${stateName}`)).identity.commit, f.a);
		assert.equal(fs.existsSync(path.join(f.workspace, directory, 'removed.h')), false);
		assert.equal(f.read(`${directory}/preserved.o`), 'object');
		assert.equal(f.read(`${directory}/.git/keep`), 'git metadata');
	}
});

test('failed pinned and development input leaves successful state and source contents unchanged', t => {
	const f = fixture(t);
	f.run();
	const before = f.mtimes();
	const state = f.read(`${stage}/${stateName}`);
	f.run({ ref: 'does-not-exist', success: false });
	f.run({ origin: '/missing-pdo-pglite-repository', success: false });
	fs.unlinkSync(path.join(f.dev, 'config.m4'));
	f.run({ source: f.dev, success: false });
	assert.deepEqual(f.mtimes(), before);
	assert.equal(f.read(`${stage}/${stateName}`), state);
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
});

test('an interrupted B import with a valid A manifest rolls back B-only files using its journal', t => {
	const f = fixture(t);
	f.run();
	f.write(`${extension}/unmanaged.c`, 'unmanaged');
	const previous = f.read(`${extension}/${stateName}`);
	fs.writeFileSync(path.join(f.workspace, 'interrupt.cjs'), `
const fs = require('node:fs');
const rename = fs.renameSync;
fs.renameSync = (source, destination) => {
  if(destination.endsWith('/ext/pdo_pglite/pdo_pglite.c')) throw new Error('Injected source-publication failure');
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
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
	assert.equal(f.read(`${extension}/unmanaged.c`), 'unmanaged');

	// Simulate interruption after publishing the successful manifest but before
	// removing the journal. The next no-op request still completes that cleanup.
	f.write(`${extension}/.php-wasm-pending.json`, JSON.stringify({ schema: 1, files: ['pdo_pglite.c', 'added.c'] }));
	f.write(`${extension}/added.c`, 'left over');
	f.run();
	assert.equal(fs.existsSync(path.join(f.workspace, extension, 'added.c')), false);
	assert.equal(fs.existsSync(path.join(f.workspace, extension, '.php-wasm-pending.json')), false);
	assert.equal(f.read(`${extension}/unmanaged.c`), 'unmanaged');
});

test('source path changes and repository identity are reflected even for equal content', t => {
	const f = fixture(t);
	f.run({ source: f.dev });
	const second = f.dev + '-second';
	fs.cpSync(f.dev, second, { recursive: true });
	f.run({ source: second });
	assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.path, second);
	f.run();
	const alternate = dockerMode ? 'file:///src/pinned-fixture' : `file://${f.repository}`;
	f.run({ origin: alternate });
	assert.equal(JSON.parse(f.read(`${stage}/${stateName}`)).identity.repository, alternate);
});

test('symlinked destinations and overlapping developer checkouts fail before overwrite', t => {
	const f = fixture(t);
	f.run();
	const state = f.read(`${stage}/${stateName}`);
	f.remove(`${extension}/pdo_pglite.c`);
	f.builder('require("fs").symlinkSync("php_pdo_pglite.h", process.argv[1])', `${extension}/pdo_pglite.c`);
	f.run({ success: false });
	assert.equal(f.read(`${extension}/php_pdo_pglite.h`), '/* header A */\n');
	f.run({ source: path.join(f.workspace, stage), success: false });
	assert.equal(f.read(`${stage}/${stateName}`), state);
});

test('the published importer package includes its executable helper', t => {
	const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'pdo-pglite-pack-cache-'));
	t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
	const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', './packages/pdo-pglite', '--cache', cache], {
		cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
	}));
	const names = packed[0].files.map(file => file.path);
	for(const name of ['pre.mak', 'static.mak', 'import-source.mjs']) assert.ok(names.includes(name), name);
});

test('an actual packed package invokes its helper from a consumer node_modules layout', t => {
	const f = fixture(t, { installed: true });
	f.run();
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* A */\n');
	f.run({ source: f.dev });
	assert.equal(f.read(`${extension}/pdo_pglite.c`), '/* DEV */\n');
	const before = f.mtimes();
	f.run({ source: f.dev });
	assert.deepEqual(f.mtimes(), before);
});
