import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirs = [
	'packages/php-wasm',
	'packages/php-cgi-wasm',
	'packages/php-cli-wasm',
	'packages/php-dbg-wasm',
];

function packFiles(packageDir)
{
	const output = execFileSync(
		'npm',
		['pack', '--dry-run', `./${packageDir}`, '--json'],
		{
			cwd: repoRoot,
			encoding: 'utf8',
			maxBuffer: 16 * 1024 * 1024,
		}
	);
	const [result] = JSON.parse(output);

	return new Set(result.files.map(file => file.path));
}

function addTarget(targets, value)
{
	if(typeof value !== 'string' || value.includes('*'))
	{
		return;
	}

	targets.add(value.replace(/^\.\//, ''));
}

function collectExportTargets(targets, value)
{
	if(typeof value === 'string')
	{
		addTarget(targets, value);
		return;
	}

	if(!value || typeof value !== 'object')
	{
		return;
	}

	for(const nestedValue of Object.values(value))
	{
		collectExportTargets(targets, nestedValue);
	}
}

function collectPackageTargets(packageJson)
{
	const targets = new Set;

	addTarget(targets, packageJson.main);
	addTarget(targets, packageJson.module);
	addTarget(targets, packageJson.types);

	for(const exportValue of Object.values(packageJson.exports ?? {}))
	{
		collectExportTargets(targets, exportValue);
	}

	return targets;
}

test('package metadata only references files that ship in the npm tarballs', () => {
	for(const packageDir of packageDirs)
	{
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, packageDir, 'package.json'), 'utf8')
		);
		const tarballFiles = packFiles(packageDir);
		const metadataTargets = collectPackageTargets(packageJson);

		for(const target of metadataTargets)
		{
			assert.ok(
				tarballFiles.has(target),
				`${packageJson.name} metadata target is missing from npm pack output: ${target}`
			);
		}
	}
});
