import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('worker debugger ships an independent worker loader and its shared base', async () => {
	const pkg = JSON.parse(await fs.readFile('packages/php-dbg-wasm/package.json', 'utf8'));
	assert.ok(pkg.exports['./PhpDbgWorker']);
	const source = await fs.readFile('source/PhpDbgWorker.mjs', 'utf8');
	assert.match(source, /PhpDbgWebBase/);
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
		assert.ok(source.includes(`php${version}-dbg-worker.mjs`));
	assert.doesNotMatch(source, /import\([^)]*-dbg-web/);
	const make = await fs.readFile('packages/php-dbg-wasm/static.mak', 'utf8');
	assert.match(make, /WORKER_DBG_MJS=.*PhpBase\.mjs.*PhpDbgWebBase\.mjs.*PhpDbgWorker\.mjs/);
});

test('debugger asset manifests resolve the actual binary without importing a runtime', async t => {
	const {writeDbgManifest} = await import('../../bin/dbg-assets.mjs');
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbg-assets-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	const filename = path.join(root, 'php8.4-dbg-worker.mjs');
	await fs.writeFile(filename, `throw Error('must not import'); const url = new URL("${'a'.repeat(40)}.wasm", import.meta.url);`);
	await fs.writeFile(path.join(root, `${'a'.repeat(40)}.wasm`), new Uint8Array([0,97,115,109,1,0,0,0]));
	await writeDbgManifest(filename);
	const manifest = JSON.parse(await fs.readFile(filename + '.assets.json'));
	assert.equal(manifest.version, '8.4');
	assert.equal(manifest.environment, 'worker');
	assert.equal(manifest.wasm, `${'a'.repeat(40)}.wasm`);
	assert.equal(manifest.bridgeVersion, 1);
	await assert.rejects(() => writeDbgManifest(path.join(root, 'missing.mjs')));
});

test('native debugger instrumentation is repeatable and fails on an unknown source layout', async () => {
	const {instrumentSource, instrumentedSources} = await import('../../bin/patch-phpdbg.mjs');
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
{
		for(const name of instrumentedSources)
{
			const source = await fs.readFile(`third_party/php${version}-src/sapi/phpdbg/${name}`, 'utf8').catch(() => null);
			if(!source) continue;
			const patched = instrumentSource(name, source);
			assert.equal(instrumentSource(name, patched), patched, `${version}/${name}`);
			assert.match(patched, /phpdbg_wasm_bridge/);
}
}
	assert.throws(() => instrumentSource('phpdbg_prompt.c', 'unknown'), /Unsupported/);
});

test('the bridge header makes the phpdbg symbols a side-module Vrzno binds visible where they are defined', async () => {
	const {instrumentSource, instrumentedSources} = await import('../../bin/patch-phpdbg.mjs');
	const header = await fs.readFile('source/phpdbg_wasm_bridge.h', 'utf8');
	// Visibility comes from the declaration a definition sees, so each file
	// that defines one of these has to include the header.
	const definedIn = {
		'ZEND_EXTERN_MODULE_GLOBALS(phpdbg)': 'phpdbg.c'
		, 'void phpdbg_restore_frame(void);': 'phpdbg_frame.c'
		, 'int phpdbg_arm_auto_global(zval *ptrzv);': 'phpdbg_info.c'
	};

	assert.match(header, /#define PHPDBG_WASM_VISIBLE __attribute__\(\(visibility\("default"\)\)\)/);

	for(const [declaration, file] of Object.entries(definedIn))
	{
		assert.ok(header.includes(`PHPDBG_WASM_VISIBLE ${declaration}`), declaration);
		assert.ok(instrumentedSources.includes(file), file);
	}

	// These two get nothing but the include.
	for(const file of ['phpdbg_frame.c', 'phpdbg_info.c'])
	{
		assert.match(instrumentSource(file, '#include "phpdbg.h"\n'), /#include "phpdbg_wasm_bridge\.h"/, file);
	}
});

test('a changed bridge header marks every instrumented source for recompilation', async t => {
	const {patchPhpDbg, instrumentedSources} = await import('../../bin/patch-phpdbg.mjs');
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbg-patch-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	const directory = path.join(root, 'sapi/phpdbg');
	// The least each file needs for the patcher to find its anchors.
	const sources = {
		'phpdbg.c': [
			'#include "phpdbg.h"'
			, '\tif (phpdbg->startup(phpdbg) == SUCCESS) {'
			, '\t\tif ((PHPDBG_G(flags) & (PHPDBG_IS_CLEANING | PHPDBG_IS_RUNNING)) == PHPDBG_IS_CLEANING) {'
			, '\t\t\tphp_request_shutdown(NULL);\n\t\t} zend_end_try();'
		].join('\n')
		, 'phpdbg_prompt.c': [
			'#include "phpdbg.h"'
			, '\t\tphpdbg_wasm_current_line = zend_get_executed_lineno();'
			, '\t\t\tzend_string_release(msg);'
		].join('\n')
		, 'phpdbg_out.c': '#include "phpdbg_io.h"\nint phpdbg_process_print(int fd, int type, const char *msg, int msglen) {\n'
		, 'phpdbg_frame.c': '#include "phpdbg.h"\n'
		, 'phpdbg_info.c': '#include "phpdbg.h"\n'
	};
	const before = new Date('2020-01-01T00:00:00Z');
	const filenames = instrumentedSources.map(name => path.join(directory, name));
	const backdate = () => Promise.all(filenames.map(filename => fs.utimes(filename, before, before)));
	const times = async () => (await Promise.all(filenames.map(filename => fs.stat(filename)))).map(stat => stat.mtimeMs);

	assert.deepEqual(Object.keys(sources).sort(), [...instrumentedSources].sort());
	await fs.mkdir(directory, {recursive: true});
	await Promise.all(instrumentedSources.map(name => fs.writeFile(path.join(directory, name), sources[name])));
	await patchPhpDbg(root);

	// A second run with nothing to change must not cause a rebuild.
	await backdate();
	await patchPhpDbg(root);
	assert.deepEqual(await times(), filenames.map(() => before.getTime()));

	// PHP 8.0 records no header dependencies, so the sources carry the change.
	await fs.writeFile(path.join(directory, 'phpdbg_wasm_bridge.h'), '/* an older bridge header */\n');
	await patchPhpDbg(root);
	assert.ok((await times()).every(time => time > before.getTime()), 'a source kept its old time');
	assert.deepEqual(
		await fs.readFile(path.join(directory, 'phpdbg_wasm_bridge.h'))
		, await fs.readFile('source/phpdbg_wasm_bridge.h')
	);
});

test('release compression preserves debugger manifest references and binary integrity', async t => {
	const {writeDbgManifest} = await import('../../bin/dbg-assets.mjs');
	const {execFileSync} = await import('node:child_process');
	const {createHash} = await import('node:crypto');
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dbg-compress-'));
	t.after(() => fs.rm(directory, {recursive: true, force: true}));
	const bytes = new Uint8Array([0,97,115,109,1,0,0,0]);
	for(const environment of ['web','worker'])
	{
		const loader = `php8.4-dbg-${environment}.mjs`;
		await fs.writeFile(path.join(directory, loader), `const wasm = '${loader}.wasm';`);
		await fs.writeFile(path.join(directory, loader + '.wasm'), bytes);
		await writeDbgManifest(path.join(directory, loader));
	}
	execFileSync('bash', [path.resolve('compress-package.sh'), directory], {stdio: 'pipe'});
	for(const environment of ['web','worker'])
	{
		const manifest = JSON.parse(await fs.readFile(path.join(directory, `php8.4-dbg-${environment}.mjs.assets.json`)));
		const binary = await fs.readFile(path.join(directory, manifest.wasm));
		assert.equal(createHash('sha256').update(binary).digest('hex'), manifest.sha256);
		assert.match(manifest.wasm, /^[a-f0-9]{40}\.wasm$/);
	}
});
