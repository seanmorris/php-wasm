import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Babel can move a dynamic import's literal into an IIFE argument. Inspect the
// native path literals in public wrappers rather than only direct import calls.
const nativeImport = /(['"`])\.\/(php(\d+\.\d+)(?:_[\w]+)?-[\w-]+\.(?:mjs|js))\1/g;

/**
 * Find public wrappers and native loaders omitted from a runtime package.
 * @param {string} directory Runtime package directory.
 * @param {object} options Artifact selection.
 * @param {Set<string>} [options.files] Paths included by npm pack.
 * @param {string} [options.phpVersion] Limit checks to one raw artifact version.
 * @returns {Array<{wrapper: string, target: string}>} Missing package files.
 */
export function missingRuntimeImports(directory, options = {})
{
	const {files, phpVersion} = options;
	const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
	const shipped = files ?? new Set(fs.readdirSync(directory));
	const wrappers = new Set;
	const visit = value => {
		if(typeof value === 'string')
		{
			const target = value.replace(/^\.\//, '');
			if(/^Php[^/]+\.(?:mjs|js)$/.test(target)) wrappers.add(target);
		}
		else if(value && typeof value === 'object')
		{
			Object.values(value).forEach(visit);
		}
	};
	visit([metadata.main, metadata.module, metadata.exports]);
	const missing = [];
	for(const wrapper of wrappers)
	{
		if(!shipped.has(wrapper))
		{
			missing.push({wrapper: 'package.json', target: wrapper});
			continue;
		}
		const source = fs.readFileSync(path.join(directory, wrapper), 'utf8');
		for(const [, , target, version] of source.matchAll(nativeImport))
		{
			if(phpVersion && version !== phpVersion) continue;
			if(!shipped.has(target)) missing.push({wrapper, target});
		}
	}
	return missing;
}

if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
{
	try
	{
		const directories = [];
		let phpVersion;
		const args = process.argv.slice(2);
		while(args.length)
		{
			const argument = args.shift();
			if(argument === '--php-version')
			{
				phpVersion = args.shift();
				if(!/^\d+\.\d+$/.test(phpVersion ?? '')) throw new Error('--php-version requires a PHP minor version');
			}
			else if(argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
			else directories.push(argument);
		}
		if(!directories.length) throw new Error('Usage: runtime-imports.mjs [--php-version 8.x] PACKAGE_DIR...');
		for(const directory of directories)
		{
			for(const {wrapper, target} of missingRuntimeImports(directory, {phpVersion}))
			{
				console.error(`${directory}: ${wrapper} references missing runtime file ${target}`);
				process.exitCode = 1;
			}
		}
	}
	catch(error)
	{
		console.error(error.message);
		process.exitCode = 1;
	}
}
