import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderScript = path.join(repoRoot, 'bin/php-wasm-builder.js');

function runBuilderHelp(...args)
{
	return spawnSync('node', [builderScript, ...args], {
		cwd: repoRoot
		, encoding: 'utf8'
	});
}

test('php-wasm-builder help prints the command list to stdout', () => {
	const result = runBuilderHelp('help');

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, '');
	assert.match(result.stdout, /Usage: php-wasm-builder COMMAND \[ARG, \.\.\.\]/);
	assert.match(result.stdout, /Available commands:/);
	assert.match(result.stdout, /\bbuild-assets\b/);
	assert.match(result.stdout, /Run `php-wasm-builder help COMMAND` for command-specific details\./);
});

test('php-wasm-builder help build reflects current build targets and defaults', () => {
	const result = runBuilderHelp('help', 'build');

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, '');
	assert.match(result.stdout, /Usage: php-wasm-builder build \[ENV_NAME\] \[MODULE_TYPE\] \[PACKAGE_TYPE\]/);
	assert.match(result.stdout, /ENV_NAME: \[web, node, worker, webview\]/);
	assert.match(result.stdout, /js:\s+build a CommonJS module \(default\)/);
	assert.match(result.stdout, /mjs:\s+build an ES module/);
	assert.match(result.stdout, /PACKAGE_TYPE: \[base, cgi, cli, dbg\]/);
	assert.match(result.stdout, /base:\s+build the core php-wasm package \(default\)/);
	assert.match(result.stdout, /cli:\s+build the php-cli-wasm package/);
	assert.match(result.stdout, /dbg:\s+build the php-dbg-wasm package/);
	assert.match(result.stdout, /PRELOAD_ASSETS entries that start with \/ or ~ are copied as-is\./);
});

test('php-wasm-builder help build-assets prints the correct usage string', () => {
	const result = runBuilderHelp('help', 'build-assets');

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, '');
	assert.match(result.stdout, /Usage: php-wasm-builder build-assets/);
	assert.match(result.stdout, /Build supporting assets described by the current directory's \.php-wasm-rc file/);
});

test('php-wasm-builder help rejects unknown commands with a nonzero exit code', () => {
	const result = runBuilderHelp('help', 'missing-command');

	assert.notEqual(result.status, 0);
	assert.equal(result.stdout, '');
	assert.match(result.stderr, /Error: Cannot print help for "missing-command"\. No such command exists\./);
});
