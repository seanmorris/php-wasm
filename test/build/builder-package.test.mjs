import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import test from 'node:test';
import {packageBuilder} from '../../bin/package-builder.mjs';

const run = promisify(execFile);

test('the actual builder tarball installs independently and scaffolds a build', {timeout: 180000}, async t => {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'php-wasm-builder-release-'));
	t.after(() => fs.rm(temporary, {recursive: true, force: true}));
	const packed = await packageBuilder({outputDir: path.join(temporary, 'release')});
	assert.ok(packed.files.includes('packages/php-cgi-wasm/static.mak'));
	assert.ok(packed.files.includes('packages/vrzno/pre.mak'));
	assert.ok(packed.files.includes('bin/source-importer.mjs'));
	assert.ok(packed.files.includes('.github/bin/verify-emscripten-async-errors.sh'));
	assert.equal(packed.files.some(name => /\.(wasm|so|data|dat|gz|br|log)$/.test(name)), false);
	assert.equal(packed.files.some(name => /(^|\/)(\.cache|\.git|\.env[^/]*|\.npmrc|node_modules)(\/|$)/.test(name)), false);
	assert.equal(packed.files.some(name => /^packages\/php-(wasm|cgi-wasm|cli-wasm|dbg-wasm)\/.*\.(mjs|js)$/.test(name)), false);
	assert.equal(packed.files.includes('bin/deploy-cloudflare-nightly.mjs'), false);
	const prefix = path.join(temporary, 'prefix');
	await run('npm', [
		'install', '--global', '--prefix', prefix
		, path.join(temporary, 'release', packed.filename)
		, '--ignore-scripts', '--no-audit', '--no-fund'
	], {cwd: temporary, maxBuffer: 4 * 1024 * 1024});
	for(const command of ['php-wasm-builder', 'php-wasm-build'])
	{
		const {stdout} = await run(path.join(prefix, 'bin', command), ['help', 'build'], {cwd: temporary});
		assert.match(stdout, /Usage: php-wasm-builder build/);
	}
	const installed = path.join(prefix, 'lib/node_modules/php-wasm-builder');
	const {stdout: extensions, stderr: discoveryError} = await run(process.execPath, [
		path.join(installed, 'bin/list-extension-packages.mjs')
	], {cwd: temporary});
	assert.equal(discoveryError, '');
	for(const name of ['vrzno', 'pdo-cfd1', 'pdo-pglite', 'waitline', 'libxml'])
	{
		assert.ok(extensions.trim().split(' ').includes(path.join(installed, 'packages', name)));
	}
	const local = path.join(temporary, 'local');
	await fs.mkdir(local);
	await run('npm', [
		'install', '--prefix', local, path.join(temporary, 'release', packed.filename)
		, '--ignore-scripts', '--no-audit', '--no-fund'
	], {cwd: temporary, maxBuffer: 4 * 1024 * 1024});
	const localBuilder = path.join(local, 'node_modules/php-wasm-builder');
	const {stdout: localExtensions, stderr: localError} = await run(process.execPath, [
		path.join(localBuilder, 'bin/list-extension-packages.mjs')
	], {cwd: temporary});
	assert.equal(localError, '');
	assert.ok(localExtensions.includes(path.join(localBuilder, 'packages/vrzno')));
	const tools = path.join(temporary, 'tools');
	const project = path.join(temporary, 'project');
	await fs.mkdir(tools);
	await fs.mkdir(project);
	const log = path.join(temporary, 'make-args.json');
	await fs.writeFile(path.join(tools, 'make'), `#!${process.execPath}\nrequire('fs').writeFileSync(process.env.BUILDER_MAKE_LOG, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));\n`, {mode: 0o755});
	await run(path.join(prefix, 'bin/php-wasm-builder'), ['build', 'node', 'mjs'], {
		cwd: project
		, env: {...process.env, PATH: `${tools}:${process.env.PATH}`, BUILDER_MAKE_LOG: log}
	});
	const called = JSON.parse(await fs.readFile(log, 'utf8'));
	assert.ok(called.args.includes('node-mjs'));
	assert.ok(called.args.includes(`PHP_BUILDER_DIR=${project}`));
	assert.ok(called.cwd.startsWith(prefix));
	for(const name of ['php-wasm', 'php-cgi-wasm', 'php-cli-wasm', 'php-dbg-wasm'])
	{
		assert.equal(JSON.parse(await fs.readFile(path.join(project, 'packages', name, 'package.json'), 'utf8')).name, name);
	}
});
