import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const stateName = '.php-wasm-source.json';
const quote = value => `'${String(value).replaceAll("'", "'\"'\"'")}'`;

// Expectations are independent of the package commands: a wrong production
// allowlist must fail these tests rather than also changing their fixtures.
const cases = {
	'pdo-pglite': {
		extensionName: 'pdo_pglite'
		, label: 'PGlite'
		, header: 'php_pdo_pglite.h'
		, other: 'pdo_pglite_db.c'
		, extra: { 'config.w32': '// Windows config A\n', 'README.md': 'README A\n' }
		, changed: { 'pdo_pglite_db.c': '/* other B */\n', 'php_pdo_pglite.h': '/* header B */\n' }
		, excluded: ['ignored.stub.php']
		, requiresVrzno: true
	}
	, 'pdo-cfd1': {
		extensionName: 'pdo_cfd1'
		, label: 'CFD1'
		, header: 'php_pdo_cfd1.h'
		, other: 'pdo_cfd1_db.c'
		, extra: {
			'config.w32': '// Windows config A\n', 'README.md': 'README A\n'
			, 'Makefile.frag': '# Make rules A\n'
			, 'pdo_cfd1_js.h.in': '#include "pdo_cfd1_init.js"\n'
			, 'pdo_cfd1_init.js': 'return "A";\n'
		}
		, changed: {
			'pdo_cfd1_db.c': '/* other B */\n', 'php_pdo_cfd1.h': '/* header B */\n'
			, 'pdo_cfd1_init.js': 'return "B";\n'
		}
		, excluded: ['ignored.stub.php']
		, requiresVrzno: true
	}
	, vrzno: {
		extensionName: 'vrzno'
		, label: 'Vrzno'
		, header: 'php_vrzno.h'
		, other: 'vrzno_other.c'
		, extra: {
			'vrzno.stub.php': '<?php // stub A\n', 'vrzno_arginfo.h': '/* arginfo A */\n'
			, 'Makefile.frag': '# Make rules A\n'
			, 'vrzno_js.h.in': '#include "vrzno_init.js"\n'
			, 'vrzno_fetch_js.h.in': '#include "php_stream_fetch_real_open.js"\n'
			, 'vrzno_init.js': 'return "A";\n'
			, 'php_stream_fetch_real_open.js': 'return await Promise.resolve(1);\n'
		}
		, changed: { 'vrzno.c': '/* B */\n', 'config.m4': 'dnl B\n', 'vrzno_init.js': 'return "B";\n' }
		, excluded: ['README.md', 'config.w32', 'unrelated.js', 'eslint.config.mjs', 'package.json', 'package-lock.json']
	}
	, waitline: {
		extensionName: 'waitline'
		, label: 'Waitline'
		, header: 'waitline.h'
		, other: 'waitline_other.c'
		, phpVersion: '8.0'
		, extra: {
			'config.w32': '// Windows config A\n'
			, 'README.md': 'README A\n'
			, 'waitline.stub.php': '<?php // stub A\n'
			, 'waitline_arginfo.h': '/* arginfo A */\n'
		}
		, changed: { 'waitline.c': '/* B */\n', 'config.m4': 'dnl B\n' }
		, excluded: []
	}
};

/**
 * Look up independently specified package expectations.
 * @param {string} name Extension package name.
 * @returns {object} Names, input fixtures, and expected changes.
 */
export function importerCase(name)
{
	assert.ok(Object.hasOwn(cases, name), name);
	const spec = cases[name];
	const phpVersion = spec.phpVersion ?? '8.3';
	const main = `${spec.extensionName}.c`;
	return {
		...spec
		, name
		, main
		, phpVersion
		, prefix: name.toUpperCase().replaceAll('-', '_')
		, stage: `third_party/${name}`
		, extension: `third_party/php${phpVersion}-src/ext/${spec.extensionName}`
		, files: {
			[main]: '/* A */\n'
			, 'config.m4': 'dnl A\n'
			, [spec.header]: '/* header A */\n'
			, [spec.other]: '/* other A */\n'
			, 'obsolete.c': '/* obsolete */\n'
			, CREDITS: `${spec.label}\nTest authors\n`
			, LICENSE: 'Test license\n'
			, ...spec.extra
		}
		, excluded: ['.env', 'lib.js', 'compiled.o', ...spec.excluded]
	};
}

/**
 * Create a real Git/Make workspace, optionally using a packed npm package and Docker.
 * @param {object} t Node test context.
 * @param {string} name Extension package name.
 * @param {object} [options] Fixture layout.
 * @param {boolean} [options.installed] Extract the actual npm package first.
 * @returns {object} Workspace controls and expected source identities.
 */
export function createImporterFixture(t, name, { installed = false } = {})
{
	const spec = importerCase(name);
	const { prefix, main, phpVersion, files, stage, extension } = spec;
	const dockerMode = process.env[`${prefix}_IMPORTER_DOCKER`] === '1';
	const image = process.env[`${prefix}_IMPORTER_IMAGE`] ?? 'php-wasm-vrzno-importer';
	if(dockerMode)
	{
		assert.notEqual(process.getuid?.(), 0, 'Docker ownership tests require a nonroot host process');
		execFileSync('docker', ['info'], { stdio: 'ignore' });
	}
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-importer-`));
	const workspace = path.join(temporary, 'workspace');
	const repository = path.join(temporary, 'repository');
	const dev = path.join(temporary, "dev source's checkout");
	for(const directory of [workspace, repository, dev]) fs.mkdirSync(directory);
	const dockerPrefix = ['run', '--rm', '-i', '--user', '0:0'
		, '--mount', `type=bind,src=${workspace},dst=/src`
		, '--mount'
		, `type=bind,src=${repository},dst=/importer-fixture,readonly`
		, '-w'
		, '/src'
		, image];
	const builder = (script, ...args) => execFileSync(dockerMode ? 'docker' : process.execPath,
		dockerMode ? [...dockerPrefix, 'node', '-e', script, ...args] : ['-e', script, ...args],
		{ cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	t.after(() => {
		try
		{
			if(dockerMode) execFileSync('docker', [...dockerPrefix, 'chown', '-R', `${process.getuid()}:${process.getgid()}`, '/src']);
		}
		finally
		{
			fs.rmSync(temporary, { recursive: true, force: true });
		}
	});
	const packageRelative = installed ? `node_modules/${name}` : `packages/${name}`;
	const packagePath = path.join(workspace, packageRelative);
	fs.mkdirSync(packagePath, { recursive: true });
	if(installed)
	{
		// The installed builder owns the shared implementation. Pack its real
		// metadata and importer, then extract both packages without install scripts.
		const builderSource = path.join(temporary, 'builder-source');
		fs.mkdirSync(path.join(builderSource, 'bin'), { recursive: true });
		for(const file of ['package.json', '.npmignore', 'bin/source-importer.mjs'])
			fs.copyFileSync(path.join(repoRoot, file), path.join(builderSource, file));
		const packedBuilder = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', builderSource, '--pack-destination', temporary, '--cache', path.join(temporary, '.npm-cache')], {
			cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
		}));
		execFileSync('tar', ['-xzf', path.join(temporary, packedBuilder[0].filename), '-C', workspace, '--strip-components=1']);
		const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', path.join(repoRoot, 'packages', name), '--pack-destination', temporary, '--cache', path.join(temporary, '.npm-cache')], {
			cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
		}));
		execFileSync('tar', ['-xzf', path.join(temporary, packed[0].filename), '-C', packagePath, '--strip-components=1']);
	}
	else
	{
		fs.mkdirSync(path.join(workspace, 'bin'));
		fs.copyFileSync(path.join(repoRoot, 'bin/source-importer.mjs'), path.join(workspace, 'bin/source-importer.mjs'));
		for(const file of ['pre.mak', 'static.mak', 'import-source.mjs', 'package.json'])
			fs.copyFileSync(path.join(repoRoot, 'packages', name, file), path.join(packagePath, file));
	}
	const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '--quiet');
	git('config', 'user.email', 'importer-test@example.invalid');
	git('config', 'user.name', 'Importer test');
	for(const [file, contents] of Object.entries(files))
	{
		fs.writeFileSync(path.join(repository, file), contents);
		fs.writeFileSync(path.join(dev, file), contents.replaceAll('A', 'DEV'));
	}
	for(const file of spec.excluded)
	{
		fs.writeFileSync(path.join(repository, file), 'DO_NOT_COPY=fixture\n');
		fs.writeFileSync(path.join(dev, file), 'DO_NOT_COPY=fixture\n');
	}
	git('add', '.');
	git('commit', '--quiet', '-m', 'A');
	const a = git('rev-parse', 'HEAD');
	for(const [file, contents] of Object.entries(spec.changed)) fs.writeFileSync(path.join(repository, file), contents);
	fs.unlinkSync(path.join(repository, 'obsolete.c'));
	fs.writeFileSync(path.join(repository, 'added.c'), '/* added B */\n');
	git('add', '-A');
	git('commit', '--quiet', '-m', 'B');
	const b = git('rev-parse', 'HEAD');
	git('branch', 'legacy-fixture', b);
	// Only the builder writes imported/cache files. The developer checkout is
	// deliberately outside its mounts, including in the Docker ownership lane.
	if(dockerMode) builder('require("fs").cpSync("/importer-fixture","pinned-fixture",{recursive:true})');
	fs.writeFileSync(path.join(workspace, 'Makefile'), `
.DEFAULT_GOAL := all
PHP_VERSION := ${phpVersion}
include ${packageRelative}/pre.mak
include ${packageRelative}/static.mak
.PHONY: all
all: runtime ${stage}/${main} ${extension}/config.m4 ${extension}/${main}
third_party/php${phpVersion}-src/.gitignore:
\t@\${DOCKER_RUN} node -e "const fs=require('fs');fs.mkdirSync('third_party/php${phpVersion}-src/ext',{recursive:true});fs.writeFileSync('third_party/php${phpVersion}-src/.gitignore','');"
configured: \${PHP_CONFIGURE_DEPS}
\t@\${DOCKER_RUN} node -e "const fs=require('fs');fs.appendFileSync('build.log','configure\\n');fs.writeFileSync('configured','');"
runtime: configured \${DEPENDENCIES}
\t@\${DOCKER_RUN} node -e "const fs=require('fs');fs.appendFileSync('build.log','build\\n');fs.writeFileSync('runtime','');"
dependencies:
\t@printf '%s\\n' 'configure=\${PHP_CONFIGURE_DEPS}' 'base=\${DEPENDENCIES}' 'cli=\${CLI_DEPENDENCIES}' 'cgi=\${CGI_DEPENDENCIES}' 'dbg=\${DBG_DEPENDENCIES}'
settings:
\t@printf '%s\\n' 'ref=$(${prefix}_REF)' 'configure=\${PHP_CONFIGURE_DEPS}' 'base=\${DEPENDENCIES}' 'cli=\${CLI_DEPENDENCIES}' 'cgi=\${CGI_DEPENDENCIES}' 'dbg=\${DBG_DEPENDENCIES}'
`);
	const run = ({ ref = a, source, origin, success = true, interrupt = false, branch, goal = 'all', enabled = '1', variables = {}, environment = {} } = {}) => {
		const preload = dockerMode ? '/src/interrupt.cjs' : path.join(workspace, 'interrupt.cjs');
		const dockerRun = dockerMode ? ['docker', ...dockerPrefix].map(quote).join(' ') : '';
		const command = dockerRun + (interrupt ? ` env ${quote(`NODE_OPTIONS=--require ${preload}`)}` : '');
		const env = { ...process.env };
		for(const packageName of Object.keys(cases))
		{
			const variablePrefix = packageName.toUpperCase().replaceAll('-', '_');
			for(const suffix of ['REF', 'BRANCH', 'REPOSITORY', 'DEV_PATH']) delete env[`${variablePrefix}_${suffix}`];
		}
		Object.assign(env, environment);
		const result = spawnSync('make', ['--no-print-directory', '-j4', goal
			, `DOCKER_RUN=${command}`, `WITH_${prefix}=${enabled}`
			, `${prefix}_REPOSITORY=${origin ?? (dockerMode ? '/src/pinned-fixture' : repository)}`
			, ...(ref === null ? [] : [`${prefix}_REF=${ref}`])
			, ...(branch ? [`${prefix}_BRANCH=${branch}`] : [])
			, ...(source ? [`${prefix}_DEV_PATH=${source}`] : [])
			, ...Object.entries(variables).map(([key, value]) => `${key}=${value}`)
		], { cwd: workspace, encoding: 'utf8', env });
		if(success) assert.equal(result.status, 0, result.stdout + result.stderr);
		else assert.notEqual(result.status, 0, 'Expected import to fail');
		return result;
	};
	const read = relative => fs.readFileSync(path.join(workspace, relative), 'utf8');
	const write = (relative, contents) => builder('require("fs").writeFileSync(process.argv[1],process.argv[2])', relative, contents);
	const remove = relative => builder('require("fs").unlinkSync(process.argv[1])', relative);
	const mtimes = () => Object.fromEntries([stage, extension].flatMap(directory =>
		fs.readdirSync(path.join(workspace, directory)).filter(file => !file.startsWith('.php-wasm-import-'))
			.map(file => [`${directory}/${file}`, fs.statSync(path.join(workspace, directory, file), { bigint: true }).mtimeNs.toString()])));
	return { ...spec, workspace, repository, dev, a, b, run, read, write, remove, builder, mtimes, dockerMode, packageRelative };
}
