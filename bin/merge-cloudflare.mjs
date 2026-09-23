#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareProfile, verifyCloudflare} from './package-cloudflare.mjs';
import {mergeRuntimePackages} from './runtime-package.mjs';

/** Merges the verified Cloudflare artifacts through the shared runtime packager. */
export function mergeCloudflare(destination, sources, options)
{
	return mergeRuntimePackages(destination, sources, cloudflareProfile, verifyCloudflare, options);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const [destination, ...sources] = process.argv.slice(2);
	if(!destination || !sources.length) throw new Error('Usage: merge-cloudflare.mjs <destination-package-dir> <source-package-dir>...');
	mergeCloudflare(destination, sources).catch(error => { console.error(error.message); process.exitCode = 1; });
}
