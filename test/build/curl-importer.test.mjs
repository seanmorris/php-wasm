import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pin = '6085917954da9682c32ebcbea27a626d2308381b';
const settings = (args = []) => JSON.parse(execFileSync('make', ['--no-print-directory', '-f', '-', ...args], {
	cwd: root, encoding: 'utf8'
	, input: `
PHP_VERSION=8.4
include packages/curl/pre.mak
all:
	@printf '%s\\n' '{"mode":"$(WITH_CURL)","ref":"$(CURL_REF)","modules":"$(EXTRA_MODULES)","archives":"$(ARCHIVES)","configure":"$(CONFIGURE_FLAGS)","tests":"$(TEST_LIST)"}'
`
}));

test('curl defaults to a shipped dynamic extension at the tested immutable commit', () => {
	const result = settings();
	assert.equal(result.mode, 'dynamic');
	assert.equal(result.ref, pin);
	assert.equal(result.modules.trim(), 'packages/curl/php8.4-curl.so');
	assert.match(result.tests, /packages\/curl\/test\/basic.mjs/);
	assert.equal(settings(['WITH_CURL=1']).mode, 'dynamic');
	assert.equal(settings(['CURL_BRANCH=custom']).ref, 'custom');
	const disabled = settings(['WITH_CURL=0']);
	assert.equal(disabled.modules + disabled.archives + disabled.configure + disabled.tests, '');
	const statically = settings(['WITH_CURL=static']);
	assert.equal(statically.modules, '');
	assert.equal(statically.archives.trim(), 'lib/lib/libcurl.a');
	assert.match(statically.configure, /--with-curl/);
});

test('CI builds curl into every static runtime and ships it with every dynamic runtime', () => {
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		for(const mode of ['dynamic', 'static'])
		{
			const result = execFileSync('make', ['--no-print-directory', '-f', '-', 'check'], {
				cwd: root
				, encoding: 'utf8'
				, input: `include .github/.env_${version}.${mode}.ci\ninclude packages/curl/pre.mak\ncheck:\n\t@echo $(WITH_CURL)\n`
			});
			assert.equal(result.trim(), mode, `${version} ${mode}`);
		}
	}
	assert.notEqual(JSON.parse(fs.readFileSync(path.join(root, 'packages/curl/package.json'))).private, true);
});

test('the curl importer stages Digest and Fetch sources, preserves no-op mtimes, and refreshes changed pins', t => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-import-'));
	t.after(() => fs.rmSync(temporary, {recursive: true, force: true}));
	const repository = path.join(temporary, 'repository');
	const workspace = path.join(temporary, 'workspace');
	const write = (name, data) => {
		fs.mkdirSync(path.dirname(path.join(repository, name)), {recursive: true});
		fs.writeFileSync(path.join(repository, name), data);
	};
	for(const name of ['Makefile', 'libcurl.pc.in', 'include/curl/curl.h', 'src/easy.c', 'src/fetch_js.c', 'src/digest_js.c', 'test/secret.php']) write(name, name);
	const git = (...args) => execFileSync('git', ['-C', repository, ...args], {encoding: 'utf8'}).trim();
	git('init', '-q');
	git('add', '.');
	const commit = () => {
		git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
		return git('rev-parse', 'HEAD');
	};
	const first = commit();
	fs.mkdirSync(path.join(workspace, 'bin'), {recursive: true});
	fs.copyFileSync(path.join(root, 'bin/source-importer.mjs'), path.join(workspace, 'bin/source-importer.mjs'));
	const stage = ref => execFileSync(process.execPath, [path.join(root, 'packages/curl/import-source.mjs'), 'stage', repository, ref], {cwd: workspace});
	stage(first);
	const source = path.join(workspace, 'third_party/php-wasm-curl');
	const stamp = path.join(source, '.php-wasm-source.json');
	assert.equal(fs.readFileSync(path.join(source, 'src/digest_js.c'), 'utf8'), 'src/digest_js.c');
	assert.equal(fs.existsSync(path.join(source, 'test')), false);
	const before = fs.statSync(stamp).mtimeMs;
	stage(first);
	assert.equal(fs.statSync(stamp).mtimeMs, before);
	write('src/digest_js.c', 'updated Digest');
	git('add', '.');
	stage(commit());
	assert.equal(fs.readFileSync(path.join(source, 'src/digest_js.c'), 'utf8'), 'updated Digest');
	stage(first);
	assert.equal(fs.readFileSync(path.join(source, 'src/digest_js.c'), 'utf8'), 'src/digest_js.c');
});
