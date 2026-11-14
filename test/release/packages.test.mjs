// These hold for the packages as they are published: the outputs of every build
// profile merged into packages/. Run them on that tree, as the release
// preparation job does. A source checkout has the loaders and none of the
// modules, so they fail there, and that is what they are for.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
	hollowExtensionModules
	, missingLoaderFiles
	, oversizedPackages
	, publishablePackageDirs
	, wasmExportNames
} from '../lib/package-checks.mjs';

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

// Only the dynamic profile is published. The shared profile's runtime packages
// are twice the limit with all six PHP versions in them, and no CDN serves them.
test('published packages stay within the CDN package size limit', () => {
	assert.deepEqual(oversizedPackages(publishablePackageDirs()), []);
});

test('every file a package loader names ships in its tarball', () => {
	assert.deepEqual(missingLoaderFiles(publishablePackageDirs()), []);
});

test('every module a loader registers as a PHP extension exports get_module', async () => {
	assert.deepEqual(await hollowExtensionModules(publishablePackageDirs()), []);
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
