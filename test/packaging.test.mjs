import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
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
const packageRoot = path.join(repoRoot, 'packages');

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

function collectIndexModuleTargets(packageDir)
{
	const indexPath = path.join(repoRoot, packageDir, 'index.mjs');

	if(!fs.existsSync(indexPath))
	{
		return [];
	}

	const source = fs.readFileSync(indexPath, 'utf8');

	return [...source.matchAll(/from\s+'\.\/([^']+)'/g)]
		.map(([, target]) => target);
}

function writeExecutable(filePath, contents)
{
	fs.writeFileSync(filePath, contents, 'utf8');
	fs.chmodSync(filePath, 0o755);
}

function createPublishTestWorkspace(t)
{
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-packages-'));
	const binDir = path.join(workspaceDir, 'bin');
	const logFile = path.join(workspaceDir, 'npm.log');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.mkdirSync(path.join(workspaceDir, 'packages', 'alpha'), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });

	fs.copyFileSync(
		path.join(repoRoot, 'publish-packages.sh'),
		path.join(workspaceDir, 'publish-packages.sh')
	);
	fs.chmodSync(path.join(workspaceDir, 'publish-packages.sh'), 0o755);

	fs.writeFileSync(
		path.join(workspaceDir, 'packages', 'alpha', 'package.json'),
		JSON.stringify({
			name: '@test/alpha',
			version: '1.0.0',
		}, null, '\t')
	);

	writeExecutable(path.join(binDir, 'npm'), `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\t%s\\n' "$PWD" "$*" >> "\${PUBLISH_TEST_LOG}"

case "$1" in
	pack)
		cat <<'JSON'
[{"files":[{"path":"package.json"},{"path":"dist/index.js"}],"size":123,"unpackedSize":456}]
JSON
		;;
	diff)
		printf '%s\\n' "package.json"
		;;
	publish)
		printf '%s\\n' "$*"
		;;
	*)
		echo "unexpected npm invocation: $*" >&2
		exit 1
		;;
esac
`);

	writeExecutable(path.join(binDir, 'sleep'), `#!/usr/bin/env bash
exit 0
`);

	return {
		binDir,
		logFile,
		workspaceDir,
	};
}

function runPublishScript(t, args)
{
	const { binDir, logFile, workspaceDir } = createPublishTestWorkspace(t);
	const result = spawnSync('bash', ['publish-packages.sh', ...args], {
		cwd: workspaceDir,
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${binDir}:${process.env.PATH ?? ''}`,
			PUBLISH_TEST_LOG: logFile,
		},
	});

	return {
		...result,
		log: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '',
	};
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

test('runtime package tarballs only ship hashed wasm payloads', () => {
	for(const packageDir of packageDirs)
	{
		const tarballFiles = packFiles(packageDir);
		const unhashedWasmFiles = [...tarballFiles]
			.filter(file => file.endsWith('.js.wasm') || file.endsWith('.mjs.wasm'));

		assert.deepEqual(
			unhashedWasmFiles,
			[],
			`${packageDir} tarball includes unhashed wasm files: ${unhashedWasmFiles.join(', ')}`
		);
	}
});

test('package index.mjs relative imports ship in the npm tarballs', () => {
	for(const packageName of fs.readdirSync(packageRoot))
	{
		const packageDir = path.join('packages', packageName);
		const importTargets = collectIndexModuleTargets(packageDir);

		if(!importTargets.length)
		{
			continue;
		}

		const tarballFiles = packFiles(packageDir);

		for(const target of importTargets)
		{
			assert.ok(
				tarballFiles.has(target),
				`${packageDir} index.mjs import is missing from npm pack output: ${target}`
			);
		}
	}
});

test('publish-packages.sh accepts flags before the npm tag and prints packed files', t => {
	const result = runPublishScript(t, [
		'--registry',
		'https://registry.example',
		'--dry-run',
		'next',
	]);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, '');
	assert.match(result.stdout, /Getting ready to publish to channel:/);
	assert.match(result.stdout, /next/);
	assert.match(result.stdout, /packlist \(2 files, 123 bytes tarball, 456 bytes unpacked\):/);
	assert.match(result.stdout, /- package\.json/);
	assert.match(result.stdout, /- dist\/index\.js/);
	assert.match(result.log, /diff --tag next --diff-name-only/);
	assert.match(
		result.log,
		/publish --tag next --registry https:\/\/registry\.example --dry-run/
	);
});

test('publish-packages.sh rejects extra positional arguments', t => {
	const result = runPublishScript(t, ['next', 'latest']);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Unexpected extra argument: latest/);
});
