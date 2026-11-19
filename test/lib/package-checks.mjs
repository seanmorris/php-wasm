// Checks on what the packages would publish, shared by the tests that run in
// every lane and the ones that only hold for the assembled release packages.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// jsDelivr documents that "packages larger than 150 MB" are not supported. Past
// that, it answers every file of the package with 403 "Package size exceeded
// the configured limit of 150 MB." It counts the unpacked files.
export const cdnPackageByteLimit = 150_000_000;

const packResults = new Map;

/**
 * Runs `npm pack --dry-run` once per package directory.
 * @param {string} packageDir Package directory, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @returns {{files: {path: string, size: number}[], unpackedSize: number}} npm's description of the tarball.
 */
export function pack(packageDir, root = repoRoot)
{
	const key = path.resolve(root, packageDir);

	if(!packResults.has(key))
	{
		const output = execFileSync(
			'npm'
			, ['pack', '--dry-run', `./${packageDir}`, '--json']
			, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}
		);
		const [result] = JSON.parse(output);

		packResults.set(key, result);
	}

	return packResults.get(key);
}

/**
 * Lists the packages publish-packages.sh would publish.
 * @param {string} root Directory that holds `packages/`.
 * @returns {string[]} Package directories, relative to the root.
 */
export function publishablePackageDirs(root = repoRoot)
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
 * Finds packages whose unpacked size is over the CDN's package limit.
 * @param {string[]} packageDirs Package directories, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @param {number} limit Largest unpacked size allowed, in bytes.
 * @returns {string[]} One sentence per package over the limit.
 */
export function oversizedPackages(packageDirs, root = repoRoot, limit = cdnPackageByteLimit)
{
	return packageDirs
		.map(packageDir => ({packageDir, bytes: pack(packageDir, root).unpackedSize}))
		.filter(({bytes}) => bytes > limit)
		.map(({packageDir, bytes}) => `${packageDir} unpacks to ${bytes} bytes, ${bytes - limit} over the ${limit}-byte CDN package limit`);
}

/**
 * Finds packages with more interpreter binaries than PHP versions. Every
 * environment of one PHP version (Node, web, worker; ESM and CommonJS) links
 * to the same binary, so hashing leaves one .wasm per version. A variant that
 * came out with its own binary would add about 13 MB per version.
 * @param {string[]} packageDirs Package directories, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @returns {string[]} One sentence per package with unshared binaries.
 */
export function unsharedBinaries(packageDirs, root = repoRoot)
{
	const problems = [];

	for(const packageDir of packageDirs)
	{
		const files = pack(packageDir, root).files.map(file => file.path);
		const versions = new Set(files
			.map(file => file.match(/^php(\d+\.\d+)-[^/]+\.(?:mjs|js)$/)?.[1])
			.filter(Boolean));
		const binaries = files.filter(file => /^[0-9a-f]+\.wasm$/.test(file));

		if(binaries.length > versions.size)
		{
			problems.push(
				`${packageDir} ships ${binaries.length} wasm binaries for ${versions.size} PHP versions`
				+ ` (${[...versions].sort().join(', ') || 'none'}); the environments of a version must share one`
			);
		}
	}

	return problems;
}

/**
 * Finds files that a shipped script names beside itself and the tarball lacks.
 * A loader says where its module is with `new URL('./name', import.meta.url)`;
 * a package that ships the loader and not the module hands out a dead address.
 * @param {string[]} packageDirs Package directories, relative to the root.
 * @param {string} root Directory that holds `packages/`.
 * @returns {string[]} One sentence per missing file.
 */
export function missingLoaderFiles(packageDirs, root = repoRoot)
{
	// Only names written out in full. A template string with a placeholder is not
	// one file, and this check cannot say which files it stands for.
	const reference = /new URL\(\s*(['"])\.\/([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g;
	const problems = [];

	for(const packageDir of packageDirs)
	{
		const files = new Set(pack(packageDir, root).files.map(file => file.path));

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
export function wasmExportNames(bytes)
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
export async function hollowExtensionModules(packageDirs, root = repoRoot)
{
	const problems = [];

	for(const packageDir of packageDirs)
	{
		const directory = path.join(root, packageDir);
		const loaders = pack(packageDir, root).files
			.map(file => file.path)
			.filter(name => /^\d+\.\d+\.mjs$/.test(name))
			.sort();

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
