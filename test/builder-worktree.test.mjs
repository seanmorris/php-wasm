import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderScript = path.join(repoRoot, 'bin/php-wasm-builder.js');
const runtimePackages = [
	'php-wasm'
	, 'php-cgi-wasm'
	, 'php-cli-wasm'
	, 'php-dbg-wasm'
];

function escapeRegExp(value)
{
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function writeExecutable(filePath, contents)
{
	fs.writeFileSync(filePath, contents, 'utf8');
	fs.chmodSync(filePath, 0o755);
}

function writeJson(filePath, value)
{
	fs.writeFileSync(filePath, JSON.stringify(value, null, '\t'), 'utf8');
}

function createBuilderWorkspace(t, { makeExitCode = 0 } = {})
{
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-builder-worktree-'));
	const binDir = path.join(workspaceDir, 'bin');
	const logFile = path.join(workspaceDir, 'make.log');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.mkdirSync(binDir, { recursive: true });

	writeExecutable(path.join(binDir, 'make'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" >> "\${BUILDER_TEST_LOG}"
exit ${makeExitCode}
`);

	return { workspaceDir, binDir, logFile };
}

function createMakeWorkspace(t, prefix)
{
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	const binDir = path.join(workspaceDir, 'bin');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.mkdirSync(binDir, { recursive: true });
	writeExecutable(path.join(binDir, 'npm'), `#!/usr/bin/env bash
exit 0
`);

	return {
		workspaceDir
		, env: {
			...process.env,
			PATH: `${binDir}:${process.env.PATH ?? ''}`
		}
	};
}

function runBuilderFromWorkspace(t, args, options = {})
{
	const { workspaceDir, binDir, logFile } = createBuilderWorkspace(t, options);
	const result = spawnSync('node', [builderScript, ...args], {
		cwd: workspaceDir
		, encoding: 'utf8'
		, env: {
			...process.env,
			PATH: `${binDir}:${process.env.PATH ?? ''}`
			, BUILDER_TEST_LOG: logFile
		}
	});

	return {
		result
		, workspaceDir
		, log: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
	};
}

test('php-wasm-builder build scaffolds runtime package trees in the target directory before invoking make', t => {
	const { result, workspaceDir, log } = runBuilderFromWorkspace(t, ['build', 'node', 'cgi', 'mjs']);

	assert.equal(result.status, 0, result.stderr);

	for(const packageName of runtimePackages)
	{
		const packageDir = path.join(workspaceDir, 'packages', packageName);

		assert.ok(fs.existsSync(path.join(packageDir, 'package.json')), `${packageName} package.json missing`);
		assert.ok(fs.existsSync(path.join(packageDir, 'README.md')), `${packageName} README missing`);
		assert.ok(fs.existsSync(path.join(packageDir, 'LICENSE')), `${packageName} LICENSE missing`);
	}

	assert.ok(fs.existsSync(path.join(workspaceDir, 'packages', 'php-wasm', 'public.d.ts')));
	assert.ok(fs.existsSync(path.join(workspaceDir, 'packages', 'php-cgi-wasm', 'PhpCgiNode.d.mts')));
	assert.ok(!fs.existsSync(path.join(workspaceDir, 'packages', 'php-cgi-wasm', 'PhpCgiNode.mjs')));

	assert.match(log, /\bnode-cgi-mjs\b/);
	assert.match(log, new RegExp(escapeRegExp(`PHP_BUILDER_DIR=${workspaceDir}`)));
	assert.match(log, /\bBUILD_TYPE=mjs\b/);
	assert.match(log, new RegExp(escapeRegExp(`ENV_DIR=${workspaceDir}/`)));
});

test('php-wasm-builder build propagates make failures', t => {
	const { result } = runBuilderFromWorkspace(t, ['build', 'node', 'mjs'], { makeExitCode: 23 });

	assert.equal(result.status, 23);
});

test('php-wasm-builder build dispatches all four core package targets', t => {
	const cases = [
		{ args: ['build', 'node', 'mjs'], expectedTarget: 'node-mjs' }
		, { args: ['build', 'node', 'cgi', 'mjs'], expectedTarget: 'node-cgi-mjs' }
		, { args: ['build', 'node', 'cli', 'mjs'], expectedTarget: 'node-cli-mjs' }
		, { args: ['build', 'node', 'dbg', 'mjs'], expectedTarget: 'node-dbg-mjs' }
	];

	for(const { args, expectedTarget } of cases)
	{
		const { result, log } = runBuilderFromWorkspace(t, args);

		assert.equal(result.status, 0, `${expectedTarget}: ${result.stderr}`);
		assert.match(log, new RegExp(`\\b${escapeRegExp(expectedTarget)}\\b`));
	}
});

test('php-wasm-builder build rejects unknown and conflicting target selectors', t => {
	const cases = [
		{ args: ['build', 'missing'], message: 'Unrecognized build argument "missing"' }
		, { args: ['build', 'web', 'node'], message: 'Conflicting ENV_NAME values "web" and "node"' }
		, { args: ['build', 'js', 'mjs'], message: 'Conflicting MODULE_TYPE values "js" and "mjs"' }
		, { args: ['build', 'base', 'cgi'], message: 'Conflicting PACKAGE_TYPE values "base" and "cgi"' }
	];

	for(const { args, message } of cases)
	{
		const { result, log } = runBuilderFromWorkspace(t, args);

		assert.equal(result.status, 1);
		assert.match(result.stderr, new RegExp(escapeRegExp(message)));
		assert.equal(log, '');
	}
});

test('php-wasm-builder build-assets dispatches the shared asset build in the workspace context', t => {
	const { result, workspaceDir, log } = runBuilderFromWorkspace(t, ['build-assets']);

	assert.equal(result.status, 0, result.stderr);
	assert.match(log, /\bassets\b/);
	assert.match(log, new RegExp(escapeRegExp(`PHP_BUILDER_DIR=${workspaceDir}`)));
	assert.match(log, new RegExp(escapeRegExp(`ENV_DIR=${workspaceDir}/`)));
});

test('node-mjs stdlib output follows PHP_BUILDER_DIR instead of the repo root package tree', t => {
	const { workspaceDir, env } = createMakeWorkspace(t, 'php-wasm-builder-stdlib-');
	const phpDistDir = path.join(workspaceDir, 'packages/php-wasm');
	const target = path.join(phpDistDir, 'stdlib/8.4-node.mjs');

	fs.mkdirSync(phpDistDir, { recursive: true });
	fs.writeFileSync(path.join(phpDistDir, 'php8.4-node.mjs'), '', 'utf8');
	fs.writeFileSync(path.join(phpDistDir, 'PhpNode.mjs'), '', 'utf8');

	const result = spawnSync(
		'make',
		[
			'--dry-run'
			, '--no-print-directory'
			, 'PHP_VERSION=8.4'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, target
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stdout,
		new RegExp(escapeRegExp(`node demo-node/get-symbols.mjs 8.4 Node > ${target}`))
	);
	assert.doesNotMatch(
		result.stdout,
		/node demo-node\/get-symbols\.mjs 8\.4 Node > packages\/php-wasm\/stdlib\/8\.4-node\.mjs/
	);
});

test('node-cgi-mjs output follows PHP_BUILDER_DIR package paths instead of the target root', t => {
	const { workspaceDir, env } = createMakeWorkspace(t, 'php-wasm-builder-cgi-');
	const target = path.join(workspaceDir, 'packages/php-cgi-wasm/PhpCgiNode.mjs');

	const result = spawnSync(
		'make',
		[
			'--dry-run'
			, '--no-print-directory'
			, 'PHP_VERSION=8.4'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, target
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stdout,
		new RegExp(escapeRegExp(`cp source/PhpCgiNode.mjs ${target}`))
	);
	assert.doesNotMatch(
		result.stdout,
		new RegExp(escapeRegExp(`make ${path.join(workspaceDir, 'PhpCgiBase.mjs')}`))
	);
});

test('node-cli-mjs output follows PHP_BUILDER_DIR package paths instead of the target root', t => {
	const { workspaceDir, env } = createMakeWorkspace(t, 'php-wasm-builder-cli-');
	const target = path.join(workspaceDir, 'packages/php-cli-wasm/PhpCliNode.mjs');

	const result = spawnSync(
		'make',
		[
			'--dry-run'
			, '--no-print-directory'
			, 'PHP_VERSION=8.4'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, target
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stdout,
		new RegExp(escapeRegExp(`cp source/PhpCliNode.mjs ${target}`))
	);
	assert.doesNotMatch(
		result.stdout,
		new RegExp(escapeRegExp(`make ${path.join(workspaceDir, 'PhpCliNode.mjs')}`))
	);
});

test('node-cli-mjs includes the base module required by PhpCliNode', t => {
	const { workspaceDir, env } = createMakeWorkspace(t, 'php-wasm-builder-cli-base-');
	const phpDistDir = path.join(workspaceDir, 'packages/php-cli-wasm');
	const result = spawnSync(
		'make',
		[
			'--no-print-directory'
			, '--silent'
			, 'PHP_VERSION=8.4'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, '--eval'
			, "print-node-cli-mjs: ; @printf '%s\\n' '$(NODE_CLI_MJS)'"
			, 'print-node-cli-mjs'
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, new RegExp(escapeRegExp(path.join(phpDistDir, 'PhpBase.mjs'))));
	assert.match(result.stdout, new RegExp(escapeRegExp(path.join(phpDistDir, 'PhpCliNode.mjs'))));
});

test('node-dbg-mjs output follows PHP_BUILDER_DIR package paths instead of the target root', t => {
	const { workspaceDir, env } = createMakeWorkspace(t, 'php-wasm-builder-dbg-');
	const target = path.join(workspaceDir, 'packages/php-dbg-wasm/PhpDbgNode.mjs');

	const result = spawnSync(
		'make',
		[
			'--dry-run'
			, '--no-print-directory'
			, 'PHP_VERSION=8.4'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, target
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stdout,
		new RegExp(escapeRegExp(path.join(workspaceDir, 'packages/php-dbg-wasm/PhpDbgNode.mjs')))
	);
	assert.match(
		result.stdout,
		new RegExp(escapeRegExp(`cp source/PhpDbgNode.mjs ${target}`))
	);
	assert.doesNotMatch(
		result.stdout,
		new RegExp(escapeRegExp(`make ${path.join(workspaceDir, 'PhpDbgNode.mjs')}`))
	);
});

test('info.mak resolves a relative PHP_ASSET_DIR from PHP_BUILDER_DIR', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-builder-assets-'));
	const rcFile = path.join(workspaceDir, '.php-wasm-rc');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.writeFileSync(
		rcFile,
		[
			'PHP_VERSION=8.4'
			, 'PHP_ASSET_DIR=./public/assets'
			, ''
		].join('\n'),
		'utf8'
	);

	const result = spawnSync(
		'make',
		[
			'--no-print-directory'
			, '-f'
			, 'info.mak'
			, 'get-asset-path'
			, `ENV_FILE=${rcFile}`
			, `PHP_BUILDER_DIR=${workspaceDir}`
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), path.join(workspaceDir, 'public/assets'));
});

test('info.mak defaults PHP_VERSION to 8.4 for copy-assets filtering', () => {
	const missingEnvFile = path.join(os.tmpdir(), `php-wasm-builder-missing-${process.pid}-${Date.now()}.env`);

	const result = spawnSync(
		'make',
		[
			'--no-print-directory'
			, '--eval=undefine PHP_VERSION'
			, '-f'
			, 'info.mak'
			, 'get-php-version'
			, `ENV_FILE=${missingEnvFile}`
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), '8.4');
});

test('php-wasm-builder copy-assets copies shared libraries and data files into PHP_ASSET_DIR in the workspace', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-builder-copy-assets-'));
	const binDir = path.join(workspaceDir, 'bin');
	const dependencyDir = path.join(workspaceDir, 'node_modules', 'fixture-dependency');
	const rcFile = path.join(workspaceDir, '.php-wasm-rc');
	const outputDir = path.join(workspaceDir, 'public', 'assets');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.mkdirSync(binDir, { recursive: true });
	fs.mkdirSync(path.join(workspaceDir, 'assets'), { recursive: true });
	fs.mkdirSync(path.join(dependencyDir, 'dist'), { recursive: true });

	writeExecutable(path.join(binDir, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "ls" && "$2" == "-p" ]]; then
	printf '%s\\n' "$WORKSPACE_DIR" "$WORKSPACE_DIR/node_modules/fixture-dependency"
	exit 0
fi

echo "unexpected npm arguments: $*" >&2
exit 1
`);

	writeJson(path.join(workspaceDir, 'package.json'), {
		name: 'fixture-workspace'
		, files: ['assets/root-support.dat']
	});
	writeJson(path.join(dependencyDir, 'package.json'), {
		name: 'fixture-dependency'
		, files: [
			'dist/libexample.so'
			, 'dist/php8.4-example.so'
			, 'dist/php8.3-example.so'
			, 'dist/example.dat'
		]
	});

	fs.writeFileSync(path.join(workspaceDir, 'assets', 'root-support.dat'), 'root\n', 'utf8');
	fs.writeFileSync(path.join(dependencyDir, 'dist', 'libexample.so'), 'shared\n', 'utf8');
	fs.writeFileSync(path.join(dependencyDir, 'dist', 'php8.4-example.so'), 'matching\n', 'utf8');
	fs.writeFileSync(path.join(dependencyDir, 'dist', 'php8.3-example.so'), 'mismatch\n', 'utf8');
	fs.writeFileSync(path.join(dependencyDir, 'dist', 'example.dat'), 'data\n', 'utf8');
	fs.writeFileSync(
		rcFile,
		[
			'PHP_VERSION=8.4'
			, 'PHP_ASSET_DIR=./public/assets'
			, ''
		].join('\n'),
		'utf8'
	);

	const result = spawnSync('node', [builderScript, 'copy-assets'], {
		cwd: workspaceDir
		, encoding: 'utf8'
		, env: {
			...process.env,
			PATH: `${binDir}:${process.env.PATH ?? ''}`
			, WORKSPACE_DIR: workspaceDir
		}
	});

	assert.equal(result.status, 0, result.stderr);
	assert.ok(fs.existsSync(path.join(outputDir, 'root-support.dat')));
	assert.ok(fs.existsSync(path.join(outputDir, 'libexample.so')));
	assert.ok(fs.existsSync(path.join(outputDir, 'php8.4-example.so')));
	assert.ok(fs.existsSync(path.join(outputDir, 'example.dat')));
	assert.ok(!fs.existsSync(path.join(outputDir, 'php8.3-example.so')));
});
