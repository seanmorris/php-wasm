#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyCloudflare } from './package-cloudflare.mjs';

export async function mergeCloudflare(destination, sources, {replaceGenerated = false} = {})
{
	const pending = new Map();
	for(const root of sources)
	{
		const manifests = (await fs.readdir(root)).filter(name => /^php8\.[0-5]-cloudflare\.manifest\.json$/.test(name));
		if(!manifests.length) throw new Error(`No Cloudflare manifests in ${root}`);
		for(const filename of manifests)
		{
			const {manifest} = await verifyCloudflare(root, filename.slice(3, 6));
			for(const name of [...manifest.files.map(file => file.path), filename])
			{
				const data = await fs.readFile(path.join(root, name));
				if(pending.has(name) && !pending.get(name).equals(data)) throw new Error(`Conflicting Cloudflare asset: ${name}`);
				pending.set(name, data);
			}
		}
	}
	// Rebuilding one version must not silently invalidate another version's
	// previously packaged helper hashes. A fresh output directory is required
	// when changing helpers shared with an older Cloudflare build.
	if(replaceGenerated)
	{
		let existing = [];
		try { existing = await fs.readdir(destination); } catch(error) { if(error.code !== 'ENOENT') throw error; }
		for(const name of existing.filter(name => /^php8\.[0-5]-cloudflare\.manifest\.json$/.test(name) && !pending.has(name)))
		{
			const {manifest} = await verifyCloudflare(destination, name.slice(3, 6));
			for(const file of manifest.files)
				if(pending.has(file.path) && createHash('sha256').update(pending.get(file.path)).digest('hex') !== file.sha256)
					throw new Error(`Rebuilding would invalidate ${name}: ${file.path}; use a fresh output directory`);
		}
	}
	// Validate every overlap before changing any destination files.
	for(const [name, data] of pending)
	{
		try
		{
			const target = path.join(destination, name);
			if(!(await fs.lstat(target)).isFile()) throw new Error(`Non-regular destination asset: ${name}`);
			if(!replaceGenerated && !(await fs.readFile(target)).equals(data)) throw new Error(`Conflicting destination asset: ${name}`);
		}
		catch(error) { if(error.code !== 'ENOENT') throw error; }
	}
	await fs.mkdir(destination, {recursive: true});
	for(const [name, data] of pending) await fs.writeFile(path.join(destination, name), data);
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const [destination, ...sources] = process.argv.slice(2);
	if(!destination || !sources.length) throw new Error('Usage: merge-cloudflare.mjs <destination-package-dir> <source-package-dir>...');
	mergeCloudflare(destination, sources).catch(error => { console.error(error.message); process.exitCode = 1; });
}
