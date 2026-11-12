// These hold for the packages as they are published: the outputs of every build
// profile merged into packages/. Run them on that tree, as the release
// preparation job does. A source checkout has the loaders and none of the
// modules, so they fail there, and that is what they are for.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Lists the files `npm pack` would put in a package's tarball.
 * @param {string} packageDir Package directory, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @returns {Set<string>} Paths relative to the package directory.
 */
function packedFiles(packageDir, root)
{
	const output = execFileSync(
		'npm'
		, ['pack', '--dry-run', `./${packageDir}`, '--json']
		, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}
	);

	return new Set(JSON.parse(output)[0].files.map(file => file.path));
}

/**
 * Lists the packages publish-packages.sh would publish.
 * @param {string} root Directory that holds `packages/`.
 * @returns {string[]} Package directories, relative to the root.
 */
function publishablePackageDirs(root)
{
	const isPublished = name => {
		const manifest = path.join(root, 'packages', name, 'package.json');

		return fs.existsSync(manifest)
			&& JSON.parse(fs.readFileSync(manifest, 'utf8')).private !== true;
	};

	return fs.readdirSync(path.join(root, 'packages')).sort()
		.filter(isPublished)
		.map(name => `packages/${name}`);
}

/**
 * Finds files that a shipped script names beside itself and the tarball lacks.
 * A loader says where its module is with `new URL('./name', import.meta.url)`;
 * a package that ships the loader and not the module hands out a dead address.
 * @param {string[]} packageDirs Package directories, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @returns {string[]} One sentence per missing file.
 */
function missingLoaderFiles(packageDirs, root)
{
	// Only names written out in full. A template string with a placeholder is not
	// one file, and this check cannot say which files it stands for.
	const reference = /new URL\(\s*(['"])\.\/([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g;
	const problems = [];

	for(const packageDir of packageDirs)
	{
		const files = packedFiles(packageDir, root);

		for(const file of [...files].filter(name => /\.(?:mjs|js)$/.test(name)).sort())
		{
			const source = fs.readFileSync(path.join(root, packageDir, file), 'utf8');
			const directory = path.posix.dirname(file);

			for(const [, , name] of source.matchAll(reference))
			{
				const target = path.posix.normalize(path.posix.join(directory, name));

				if(!files.has(target))
				{
					problems.push(`${packageDir}/${file} names ${target}, which the package does not ship`);
				}
			}
		}
	}

	return problems;
}

/**
 * Reads the names a WebAssembly module exports, without compiling it.
 * @param {Uint8Array} bytes The module.
 * @returns {string[]} Export names, in order.
 */
function wasmExportNames(bytes)
{
	let offset = 8;
	const unsigned = () => {
		let value = 0;
		let shift = 0;
		let byte;

		do
		{
			byte = bytes[offset++];
			value |= (byte & 0x7f) << shift;
			shift += 7;
		}
		while(byte & 0x80);

		return value >>> 0;
	};

	assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('latin1'), '\0asm', 'not a WebAssembly module');

	while(offset < bytes.length)
	{
		const id = bytes[offset++];
		const size = unsigned();

		// Section 7 holds the exports: a name, a kind byte and an index each.
		if(id !== 7)
		{
			offset += size;

			continue;
		}

		const names = [];

		for(let count = unsigned(); count > 0; count--)
		{
			const length = unsigned();

			names.push(Buffer.from(bytes.subarray(offset, offset + length)).toString('utf8'));
			offset += length + 1;
			unsigned();
		}

		return names;
	}

	return [];
}

/**
 * Finds modules a version loader registers as PHP extensions that PHP would not
 * accept. PHP opens such a module and asks it for `get_module`; without that
 * export it reports "Invalid library (maybe not a PHP library)". A side module
 * linked from objects compiled for a static build comes out exactly so.
 * @param {string[]} packageDirs Package directories, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @returns {Promise<string[]>} One sentence per rejected module.
 */
async function hollowExtensionModules(packageDirs, root)
{
	const problems = [];

	for(const packageDir of packageDirs)
	{
		const directory = path.join(root, packageDir);
		const loaders = [...packedFiles(packageDir, root)].filter(name => /^\d+\.\d+\.mjs$/.test(name)).sort();

		for(const loader of loaders)
		{
			const {getLibs} = await import(pathToFileURL(path.join(directory, loader)).href);
			// A loader marks an extension, as opposed to a library it needs, with `ini`.
			const extensions = (getLibs?.() ?? []).filter(lib => typeof lib === 'object' && 'ini' in lib);

			for(const extension of extensions)
			{
				const file = fileURLToPath(new URL(String(extension.url)));

				// A module that is not there at all is missingLoaderFiles()'s finding.
				if(!fs.existsSync(file))
				{
					continue;
				}

				if(!wasmExportNames(fs.readFileSync(file)).includes('get_module'))
				{
					problems.push(
						`${packageDir}/${path.relative(directory, file)}, loaded by ${loader} as a PHP extension,`
						+ ' does not export get_module'
					);
				}
			}
		}
	}

	return problems;
}

/**
 * Builds the smallest WebAssembly module with one exported function.
 * @param {string} name Name to export the function under.
 * @returns {Uint8Array} The module.
 */
function wasmExporting(name)
{
	const text = Buffer.from(name, 'utf8');

	return Uint8Array.from([
		0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
		// One type, a function of no parameters and no results; one function of it.
		, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00
		, 0x03, 0x02, 0x01, 0x00
		// One export: the name, kind 0 (function), index 0.
		, 0x07, text.length + 4, 0x01, text.length, ...text, 0x00, 0x00
		// One body of two bytes: no locals, then end.
		, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b
	]);
}

test('every file a package loader names ships in its tarball', () => {
	assert.deepEqual(missingLoaderFiles(publishablePackageDirs(repoRoot), repoRoot), []);
});

test('every module a loader registers as a PHP extension exports get_module', async () => {
	assert.deepEqual(await hollowExtensionModules(publishablePackageDirs(repoRoot), repoRoot), []);
});

test('the checks report a loader without its module and a module PHP would reject', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-release-packages-'));

	t.after(() => fs.rmSync(root, {recursive: true, force: true}));

	const loader = file => [
		'export const getLibs = () => ['
		, `\t{name: '${file}', url: new URL('./${file}', import.meta.url), ini: true}`
		, '\t, {name: \'libsupport.so\', url: new URL(\'./libsupport.so\', import.meta.url)}'
		, '];'
		, ''
	].join('\n');
	const writePackage = (name, modules) => {
		const directory = path.join(root, 'packages', name);

		fs.mkdirSync(directory, {recursive: true});
		fs.writeFileSync(
			path.join(directory, 'package.json')
			, JSON.stringify({name: `fixture-${name}`, version: '0.0.0', files: ['*.mjs', '*.so']})
		);
		fs.writeFileSync(path.join(directory, '8.4.mjs'), loader(`php8.4-${name}.so`));

		for(const [file, bytes] of Object.entries(modules))
		{
			fs.writeFileSync(path.join(directory, file), bytes);
		}
	};

	// The module is a real one: the engine accepts it and lists the same export.
	assert.deepEqual(
		WebAssembly.Module.exports(new WebAssembly.Module(wasmExporting('get_module'))).map(entry => entry.name)
		, wasmExportNames(wasmExporting('get_module'))
	);

	// A library the extension needs is not an extension and has no get_module.
	writePackage('whole', {
		'php8.4-whole.so': wasmExporting('get_module')
		, 'libsupport.so': wasmExporting('support')
	});
	writePackage('absent', {'libsupport.so': wasmExporting('support')});
	writePackage('hollow', {
		'php8.4-hollow.so': wasmExporting('asyncify_get_state')
		, 'libsupport.so': wasmExporting('support')
	});

	const packageDirs = publishablePackageDirs(root);

	assert.deepEqual(packageDirs, ['packages/absent', 'packages/hollow', 'packages/whole']);
	assert.deepEqual(missingLoaderFiles(packageDirs, root), [
		'packages/absent/8.4.mjs names php8.4-absent.so, which the package does not ship'
	]);
	assert.deepEqual(await hollowExtensionModules(packageDirs, root), [
		'packages/hollow/php8.4-hollow.so, loaded by 8.4.mjs as a PHP extension, does not export get_module'
	]);
});
