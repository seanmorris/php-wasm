import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeRegExp(value)
{
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('builder-mode PRELOAD_ASSETS keeps anchored paths and resolves relative paths from PHP_BUILDER_DIR', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-preload-assets-'));
	const absoluteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-preload-absolute-'));
	const homeDir = path.join(workspaceDir, 'home');
	const binDir = path.join(workspaceDir, 'bin');
	const publicDir = path.join(workspaceDir, 'public');
	const relativeDir = path.join(workspaceDir, 'relative');
	const rcFile = path.join(workspaceDir, '.php-wasm-rc');
	const homeAsset = path.join(homeDir, 'home-asset.txt');
	const absoluteAsset = path.join(absoluteDir, 'absolute-asset.txt');
	const relativeAsset = path.join(relativeDir, 'relative-asset.txt');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
		fs.rmSync(absoluteDir, { recursive: true, force: true });
	});

	fs.mkdirSync(homeDir, { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.mkdirSync(publicDir, { recursive: true });
	fs.mkdirSync(relativeDir, { recursive: true });
	fs.writeFileSync(path.join(binDir, 'npm'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
	fs.chmodSync(path.join(binDir, 'npm'), 0o755);

	fs.writeFileSync(homeAsset, 'home\n', 'utf8');
	fs.writeFileSync(absoluteAsset, 'absolute\n', 'utf8');
	fs.writeFileSync(relativeAsset, 'relative\n', 'utf8');
	fs.writeFileSync(
		rcFile,
		[
			'PHP_VERSION=8.4'
			, 'PHP_DIST_DIR=./public'
			, 'PHP_ASSET_DIR=./public'
			, `PRELOAD_ASSETS=~/home-asset.txt ${absoluteAsset} relative/relative-asset.txt`
			, ''
		].join('\n'),
		'utf8'
	);

	const result = spawnSync(
		'make',
		[
			'--dry-run'
			, '--no-print-directory'
			, '.cache/preload-collected'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, `ENV_FILE=${rcFile}`
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env: {
				...process.env,
				HOME: homeDir
				, PATH: `${binDir}:${process.env.PATH ?? ''}`
			}
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /No rule to make target/);
	assert.match(
		result.stdout,
		new RegExp(
			`cp -prfL ~/home-asset\\.txt ${escapeRegExp(absoluteAsset)} ${escapeRegExp(path.join(workspaceDir, 'relative/relative-asset.txt'))} third_party/preload/`
		)
	);
	assert.doesNotMatch(
		result.stdout,
		new RegExp(escapeRegExp(`${workspaceDir}${absoluteAsset}`))
	);
	assert.doesNotMatch(
		result.stdout,
		new RegExp(escapeRegExp(`${workspaceDir}/~/home-asset.txt`))
	);
});
