import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {missingRuntimeImports} from './lib/runtime-imports.mjs';
import {oversizedPackages, pack, publishablePackageDirs, unsharedBinaries} from './lib/package-checks.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirs = [
	'packages/php-wasm'
	, 'packages/php-cgi-wasm'
	, 'packages/php-cli-wasm'
	, 'packages/php-dbg-wasm'
	, 'packages/php-cloud-wasm'
	, 'packages/php-sdl-wasm'
	, 'packages/vrzno'
	, 'packages/pdo-pglite'
	, 'packages/waitline'
];
const packageRoot = path.join(repoRoot, 'packages');

function packFiles(packageDir)
{
	return new Set(pack(packageDir).files.map(file => file.path));
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

function createPublishTestWorkspace(t, options = {})
{
	const { diffMode = 'changed' } = options;
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
		case "${diffMode}" in
			changed)
				printf '%s\\n' "package.json"
				;;
			empty)
				:
				;;
			missing)
				echo "npm error code E404" >&2
				echo "npm error 404 '@test/alpha@latest' is not in this registry." >&2
				exit 1
				;;
			*)
				echo "unexpected diff mode: ${diffMode}" >&2
				exit 1
				;;
		esac
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
	writeExecutable(path.join(binDir, 'make'), `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "package-builder" ]]
OUTPUT="\${2#BUILDER_PACKAGE_OUTPUT=}"
mkdir -p "$OUTPUT"
printf '%s\\n' '{"filename":"php-wasm-builder-0.1.0.tgz"}' > "$OUTPUT/builder.manifest.json"
touch "$OUTPUT/php-wasm-builder-0.1.0.tgz"
`);

	return {
		binDir,
		logFile,
		workspaceDir,
	};
}

function runPublishScript(t, args, options)
{
	const { binDir, logFile, workspaceDir } = createPublishTestWorkspace(t, options);
	const result = spawnSync('bash', ['publish-packages.sh', ...args], {
		cwd: workspaceDir,
		encoding: 'utf8',
		env: {
			...process.env,
			CI: '',
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

test('public runtime wrappers ship every native loader they import', () => {
	for(const packageDir of packageDirs.slice(0, 4))
	{
		assert.deepEqual(
			missingRuntimeImports(path.join(repoRoot, packageDir), {
				files: packFiles(packageDir)
				, phpVersion: process.env.PHP_VERSION
			})
			, []
			, `${packageDir} omits native loaders needed when its public wrappers are instantiated`
		);
	}
});

test('runtime packages ship one wasm binary per PHP version', () => {
	assert.deepEqual(unsharedBinaries(publishablePackageDirs()), []);
});

test('the size and shared-binary checks report an oversized package and a duplicated binary', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'package-limits-'));

	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const hash = digit => `${digit.repeat(40)}.wasm`;
	const writePackage = (name, files, manifest = {}) => {
		const directory = path.join(root, 'packages', name);

		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
			name: `@test/${name}`
			, version: '1.0.0'
			, files: ['*.mjs', '*.js', '[0-9a-f]*.wasm']
			, ...manifest
		}));

		for(const [file, bytes] of Object.entries(files))
		{
			fs.writeFileSync(path.join(directory, file), Buffer.alloc(bytes, 1));
		}
	};

	// Two PHP versions, three environments each, one binary per version.
	writePackage('shared', {
		'php8.3-node.mjs': 10
		, 'php8.3-node.js': 10
		, 'php8.3-web.mjs': 10
		, [hash('a')]: 1000
		, 'php8.4-node.mjs': 10
		, 'php8.4-node.js': 10
		, 'php8.4-web.mjs': 10
		, [hash('b')]: 1000
	});
	// The same, except that the 8.4 web build did not link to the shared binary.
	writePackage('duplicated', {
		'php8.3-node.mjs': 10
		, 'php8.3-web.mjs': 10
		, [hash('a')]: 1000
		, 'php8.4-node.mjs': 10
		, 'php8.4-web.mjs': 10
		, [hash('b')]: 1000
		, [hash('c')]: 1000
	});
	// One version built and not hashed yet, as in a per-version test job.
	writePackage('partial', {'php8.4-node.mjs': 10, 'php8.4-node.mjs.wasm': 1000});
	// An extension package has no interpreter binary at all.
	writePackage('extension', {'index.mjs': 10, 'php8.4-example.so': 500}, {files: ['*.mjs', '*.so']});
	writePackage('unpublished', {[hash('d')]: 5000}, {private: true});
	fs.mkdirSync(path.join(root, 'packages', 'not-a-package'));

	const packageDirs = publishablePackageDirs(root);

	assert.deepEqual(packageDirs, ['duplicated', 'extension', 'partial', 'shared'].map(name => `packages/${name}`));
	assert.deepEqual(unsharedBinaries(packageDirs, root), [
		'packages/duplicated ships 3 wasm binaries for 2 PHP versions (8.3, 8.4); the environments of a version must share one'
	]);
	assert.ok(!pack('packages/partial', root).files.some(file => file.path.endsWith('.wasm')), 'an unhashed binary is not packed');

	// Every fixture is far below the real limit.
	assert.deepEqual(oversizedPackages(packageDirs, root), []);

	// With the limit set to a package's exact size it still fits; one byte less and it is reported.
	const bytes = pack('packages/shared', root).unpackedSize;

	assert.ok(bytes > 2000, `npm reported ${bytes} unpacked bytes`);
	assert.deepEqual(oversizedPackages(['packages/shared'], root, bytes), []);
	assert.deepEqual(oversizedPackages(['packages/shared'], root, bytes - 1), [
		`packages/shared unpacks to ${bytes} bytes, 1 over the ${bytes - 1}-byte CDN package limit`
	]);
	// The larger package is over a limit the smaller ones meet.
	assert.deepEqual(
		oversizedPackages(packageDirs, root, bytes).map(problem => problem.split(' ')[0])
		, ['packages/duplicated']
	);
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
	assert.match(result.log, /--diff php-wasm-builder@next --diff .*php-wasm-builder-0\.1\.0\.tgz/);
	assert.match(result.log, /publish .*php-wasm-builder-0\.1\.0\.tgz --tag next --registry https:\/\/registry\.example --dry-run/);
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

test('publish-packages.sh skips publishes when npm diff is empty', t => {
	const result = runPublishScript(t, ['next'], { diffMode: 'empty' });

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /no diff against next; skipping publish/);
	assert.match(result.stdout, /No packages need publishing for tag next\./);
	assert.doesNotMatch(result.log, /publish --tag next/);
});

test('publish-packages.sh still publishes first-release packages when npm diff returns 404', t => {
	const result = runPublishScript(t, ['next'], { diffMode: 'missing' });

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /package missing on next; treating as a publish candidate/);
	assert.match(result.log, /publish --tag next --dry-run/);
});

test('publish-packages.sh uses a fresh otp source for real publishes', t => {
	const result = runPublishScript(t, [
		'--real',
		'--otp-command',
		'printf 654321',
		'next',
	]);

	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.log,
		/publish --tag next --otp 654321/
	);
});
