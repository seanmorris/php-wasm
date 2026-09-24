import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';
import {allowedSource} from '../../bin/prepare-build-workspace.mjs';
import {packageSdlBuild, verifySdl, mergeSdl, wasmLibraries} from '../../bin/package-sdl.mjs';

const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

/**
 * Encodes a Wasm unsigned integer for native dependency fixtures.
 * @param {number} value Integer to encode.
 * @returns {number[]} LEB128 bytes.
 */
function uleb(value)
{
	const bytes = [];
	do
	{
		bytes.push((value & 127) | (value > 127 ? 128 : 0));
		value >>>= 7;
	} while(value);
	return bytes;
}

/**
 * Creates valid Wasm with linker-recorded native dependencies.
 * @param {string[]} names Required native libraries.
 * @returns {Buffer} Wasm bytes.
 */
function dylink(names)
{
	const needed = [...uleb(names.length), ...names.flatMap(name => [...uleb(name.length), ...Buffer.from(name)])];
	const section = [8, ...Buffer.from('dylink.0'), 2, ...uleb(needed.length), ...needed];
	return Buffer.concat([wasm, Buffer.from([0, ...uleb(section.length), ...section])]);
}

/**
 * Creates a minimal ordinary Make output and an isolated package directory.
 * @param {import('node:test').TestContext} t Test context.
 * @param {Buffer} binary Matching Wasm output.
 * @returns {Promise<object>} Fixture paths and version staging helper.
 */
async function fixture(t, binary = wasm)
{
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'php-sdl-package-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	const source = path.join(root, 'raw');
	const packagesRoot = path.join(root, 'packages');
	const destination = path.join(root, 'final');
	await fs.mkdir(source);
	await fs.mkdir(packagesRoot);
	const stage = async (version = '8.4') => {
		const name = `php${version}_sdl-web.mjs`;
		await fs.writeFile(path.join(source, name), `const wasm = '${name}.wasm'; export default async args => args;\n`);
		await fs.writeFile(path.join(source, `${name}.wasm`), binary);
		return packageSdlBuild(source, version, destination, {packagesRoot});
	};
	return {root, source, packagesRoot, destination, stage};
}

test('SDL packages all six matched versions without another runtime package or stale assets', async t => {
	const {source, destination, stage} = await fixture(t);
	await fs.writeFile(path.join(source, 'old.data'), 'unreferenced data');
	await fs.writeFile(path.join(source, 'old.so'), 'unreferenced library');
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		const manifest = await stage(version);
		assert.deepEqual(manifest.assets, []);
		assert.equal(manifest.provenance.nativeWasmSha256, createHash('sha256').update(wasm).digest('hex'));
		await verifySdl(destination, version);
		const native = await fs.readFile(path.join(source, `php${version}_sdl-web.mjs`), 'utf8');
		assert.ok(native.includes(`php${version}_sdl-web.mjs.wasm`), 'Packaging preserves the original Make pair');
	}
	const pkg = JSON.parse(await fs.readFile(path.join(destination, 'package.json')));
	assert.equal(pkg.dependencies, undefined);
	const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: destination, encoding: 'utf8'}));
	assert.equal(packed.files.filter(file => file.path.endsWith('-sdl.manifest.json')).length, 6);
	assert.ok(packed.files.some(file => file.path === 'PhpWebBase.mjs'));
	assert.ok(packed.files.every(file => !/old\.|\.so$|\.data$|\.c$|\.mak$|PhpWeb\.mjs$/.test(file.path)));
});

test('SDL follows native dependencies recursively and owns shared ICU preload data', async t => {
	const {packagesRoot, destination, stage} = await fixture(t, dylink(['libpng.so', 'libicudata.so']));
	await fs.mkdir(path.join(packagesRoot, 'codecs'));
	await fs.mkdir(path.join(packagesRoot, 'intl'));
	await fs.writeFile(path.join(packagesRoot, 'codecs/libpng.so'), dylink(['libz.so']));
	await fs.writeFile(path.join(packagesRoot, 'codecs/libz.so'), wasm);
	await fs.writeFile(path.join(packagesRoot, 'intl/libicudata.so'), wasm);
	await fs.writeFile(path.join(packagesRoot, 'intl/icudt72l.dat'), 'icu fixture');
	const manifest = await stage();
	assert.deepEqual(manifest.assets.map(asset => asset.name), ['icudt72l.dat', 'libicudata.so', 'libpng.so', 'libz.so']);
	const preload = manifest.assets.find(asset => asset.type === 'preload');
	assert.equal(preload.mountPath, '/preload/icudt72l.dat');
	await fs.appendFile(path.join(destination, preload.path), 'tampered');
	await assert.rejects(verifySdl(destination, '8.4'), /digest mismatch/);
});

test('SDL includes a referenced preload archive and excludes stale archives', async t => {
	const {source, packagesRoot, destination, stage} = await fixture(t);
	await stage();
	await fs.appendFile(path.join(source, 'php8.4_sdl-web.mjs'), "\nconst data = 'php.data';\n");
	await fs.writeFile(path.join(source, 'php.data'), 'current preload');
	await fs.writeFile(path.join(source, 'stale.data'), 'old preload');
	const manifest = await packageSdlBuild(source, '8.4', destination, {packagesRoot});
	assert.deepEqual(manifest.assets.map(asset => asset.name), ['php.data']);
	await fs.writeFile(path.join(source, 'php8.4_sdl-web.mjs'), `
const wasm = 'php8.4_sdl-web.mjs.wasm';
export default function runtime(args) {
	return {
		dataUrl: args.locateFile(new URL('php.data', import.meta.url).href, ''),
		ccall: () => 0, FS: {analyzePath: () => ({exists: true}), writeFile() {}}
	};
}
`);
	await packageSdlBuild(source, '8.4', destination, {packagesRoot});
	const {PhpSdl} = await import(pathToFileURL(path.join(destination, 'php8.4-sdl.mjs')));
	const runtime = await new PhpSdl({persist: false}).binary;
	assert.equal(String(runtime.dataUrl), pathToFileURL(path.join(destination, manifest.assets[0].path)).href);
});

test('the generated SDL entry mounts shared ICU data before starting PHP', async t => {
	const {source, packagesRoot, destination, stage} = await fixture(t, dylink(['libicudata.so']));
	await fs.mkdir(path.join(packagesRoot, 'intl'));
	await fs.writeFile(path.join(packagesRoot, 'intl/libicudata.so'), wasm);
	await fs.writeFile(path.join(packagesRoot, 'intl/icudt72l.dat'), 'icu fixture');
	await stage();
	await fs.writeFile(path.join(source, 'php8.4_sdl-web.mjs'), `
const wasm = 'php8.4_sdl-web.mjs.wasm';
export default function runtime() {
	const preloads = [];
	return {preloads, ccall: () => 0, FS: {
		analyzePath: () => ({exists: true}), writeFile() {},
		createPreloadedFile(parent, name, url, read, write, done) {
			preloads.push({parent, name, url}); done();
		}
	}};
}
`);
	await packageSdlBuild(source, '8.4', destination, {packagesRoot});
	const {PhpSdl} = await import(pathToFileURL(path.join(destination, 'php8.4-sdl.mjs')));
	const runtime = await new PhpSdl({persist: false}).binary;
	assert.equal(runtime.preloads.length, 1);
	assert.equal(runtime.preloads[0].parent, '/preload/');
	assert.equal(runtime.preloads[0].name, 'icudt72l.dat');
	assert.match(runtime.preloads[0].url, /[a-f0-9]{40}\.dat$/);
});

test('SDL fails before publishing an incomplete or conflicting native dependency closure', async t => {
	const {packagesRoot, destination, stage} = await fixture(t, dylink(['libmissing.so']));
	await assert.rejects(stage(), /Missing SDL supporting asset: libmissing.so/);
	await assert.rejects(fs.access(destination), {code: 'ENOENT'});
	for(const name of ['a', 'b']) await fs.mkdir(path.join(packagesRoot, name));
	await fs.writeFile(path.join(packagesRoot, 'a/libmissing.so'), wasm);
	await fs.writeFile(path.join(packagesRoot, 'b/libmissing.so'), dylink([]));
	await assert.rejects(stage(), /Conflicting SDL supporting asset/);
});

test('SDL merges only verified manifests and rejects inconsistent helpers across versions', async t => {
	const first = await fixture(t), second = await fixture(t);
	await first.stage('8.3');
	await second.stage('8.4');
	const output = path.join(first.root, 'merged');
	await fs.writeFile(path.join(second.destination, 'unowned.mjs'), 'unowned');
	await mergeSdl(output, [first.destination, second.destination]);
	await verifySdl(output, '8.3');
	await verifySdl(output, '8.4');
	await assert.rejects(fs.access(path.join(output, 'unowned.mjs')), {code: 'ENOENT'});
	await fs.appendFile(path.join(second.destination, 'PhpBase.mjs'), '\n// changed\n');
	await assert.rejects(mergeSdl(output, [second.destination]), /digest mismatch/);
});

test('SDL source snapshots retain native JS link inputs, without generated runtime code', () => {
	assert.equal(allowedSource('packages/php-sdl-wasm/js/library.js'), true);
	assert.equal(allowedSource('packages/php-sdl-wasm/js/text-input.js'), true);
	assert.equal(allowedSource('packages/php-sdl-wasm/php8.4-sdl-runtime.mjs'), false);
	assert.deepEqual(wasmLibraries(wasm), []);
	assert.deepEqual(wasmLibraries(dylink(['libz.so'])), ['libz.so']);
	assert.throws(() => wasmLibraries(dylink(['../libz.so'])), /Invalid SDL shared library name/);
});

test('SDL Make target preserves the selected configuration and separates raw/final outputs', () => {
	const result = spawnSync('make', ['--dry-run', 'sdl-mjs', 'ENV_FILE=/dev/null', 'BUILD_WORKSPACE=', 'MAKE=true', 'MAKE_SHUFFLE=', 'PHP_VERSION=8.3'], {encoding: 'utf8'});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /web-mjs .*ENV_FILE='\/dev\/null' WITH_SDL=1 PHP_DIST_DIR='\.cache\/sdl-raw\/php8\.3'/);
	assert.match(result.stdout, /node bin\/package-sdl.mjs --build '\.cache\/sdl-raw\/php8\.3' '8\.3' '.\/packages\/php-sdl-wasm'/);
	const mixed = spawnSync('make', ['--dry-run', 'sdl-mjs', 'web-mjs'], {encoding: 'utf8'});
	assert.notEqual(mixed.status, 0);
	assert.match(mixed.stderr, /SDL package targets must run separately/);
});

test('SDL CLI selects the standalone Make target and preserves the caller configuration', async t => {
	const {root} = await fixture(t);
	const bin = path.join(root, 'bin');
	const log = path.join(root, 'make-arguments.json');
	const builder = fileURLToPath(new URL('../../bin/php-wasm-builder.js', import.meta.url));
	await fs.mkdir(bin);
	await fs.writeFile(path.join(root, '.php-wasm-rc'), 'include profiles/sdl.mak\n');
	await fs.writeFile(path.join(bin, 'make'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.SDL_TEST_MAKE_LOG, JSON.stringify(process.argv.slice(2)));\n`, {mode: 0o755});
	const options = {cwd: root, encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, SDL_TEST_MAKE_LOG: log}};
	const result = spawnSync(process.execPath, [builder, 'build', 'sdl'], options);
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const args = JSON.parse(await fs.readFile(log, 'utf8'));
	assert.ok(args.includes('sdl-mjs'));
	assert.ok(args.includes('BUILD_TYPE=mjs'));
	assert.ok(args.includes(`ENV_FILE=${path.join(root, '.php-wasm-rc')}`));
	assert.ok(args.includes(`SDL_OUTPUT_DIR=${path.join(root, 'packages/php-sdl-wasm')}`));
	assert.ok(args.includes(`BUILD_WORKSPACE=${path.join(root, '.cache/build')}`));
	await fs.rm(log);
	for(const unsupported of ['js', 'cgi', 'cli', 'dbg'])
	{
		const rejected = spawnSync(process.execPath, [builder, 'build', 'sdl', unsupported], options);
		assert.notEqual(rejected.status, 0);
		assert.match(rejected.stderr, /SDL supports embedded PHP ESM only/);
	}
	await assert.rejects(fs.access(log), {code: 'ENOENT'});
});

test('ordinary PHP packages do not depend on or import the SDL runtime', async t => {
	const pkg = JSON.parse(await fs.readFile(new URL('../../packages/php-wasm/package.json', import.meta.url)));
	for(const dependencies of [pkg.dependencies, pkg.optionalDependencies, pkg.peerDependencies])
	{
		assert.equal(dependencies?.['php-sdl-wasm'], undefined);
		assert.equal(dependencies?.['php-cloud-wasm'], undefined);
	}
	for(const name of ['PhpWeb', 'PhpWebBase', 'PhpBase', 'PhpNode', 'PhpWorker', 'PhpWebview'])
	{
		const source = await fs.readFile(new URL(`../../source/${name}.mjs`, import.meta.url), 'utf8');
		assert.doesNotMatch(source, /(?:from|import).*['"`]php-(?:sdl|cloud)-wasm/);
		assert.doesNotMatch(source, /php8\.[0-5]_sdl/);
	}
	const {root} = await fixture(t);
	await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
	for(const name of ['PhpWeb.mjs', 'php8.4-web.mjs', 'php8.4_sdl-web.mjs']) await fs.writeFile(path.join(root, name), '// package fixture\n');
	const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: root, encoding: 'utf8'}));
	assert.ok(packed.files.some(file => file.path === 'php8.4-web.mjs'));
	assert.ok(!packed.files.some(file => file.path.includes('_sdl')));
});
