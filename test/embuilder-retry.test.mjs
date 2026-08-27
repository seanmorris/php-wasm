import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const retryScript = path.join(repoRoot, '.github/bin/retry-embuilder.sh');
const sdlMakefile = path.join(repoRoot, 'packages/sdl/static.mak');

function writeExecutable(filePath, contents)
{
	fs.writeFileSync(filePath, contents, 'utf8');
	fs.chmodSync(filePath, 0o755);
}

function runRetry(t, embuilderBody, maxAttempts = 3)
{
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-embuilder-retry-'));
	const binDir = path.join(workspaceDir, 'bin');
	const countFile = path.join(workspaceDir, 'attempts');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.mkdirSync(binDir, { recursive: true });
	writeExecutable(
		path.join(binDir, 'embuilder'),
		[
			'#!/usr/bin/env bash'
			, 'set -euo pipefail'
			, 'count=0'
			, 'if [[ -f "${EMBUILDER_TEST_COUNT}" ]]; then'
			, '\tcount="$(<"${EMBUILDER_TEST_COUNT}")"'
			, 'fi'
			, 'count=$((count + 1))'
			, 'printf \'%s\\n\' "${count}" > "${EMBUILDER_TEST_COUNT}"'
			, embuilderBody
			, ''
		].join('\n')
	);

	const result = spawnSync('bash', [retryScript, 'build', 'USER'], {
		cwd: repoRoot
		, encoding: 'utf8'
		, env: {
			...process.env,
			PATH: `${binDir}:${process.env.PATH ?? ''}`
			, EMBUILDER_TEST_COUNT: countFile
			, EMBUILDER_RETRY_ATTEMPTS: String(maxAttempts)
			, EMBUILDER_RETRY_DELAY_SECONDS: '0'
		}
	});

	return {
		result
		, attempts: Number(fs.readFileSync(countFile, 'utf8').trim())
	};
}

test('retry-embuilder retries transient port download failures', t => {
	const { result, attempts } = runRetry(
		t,
		[
			'if (( count < 3 )); then'
			, '\techo "urllib.error.HTTPError: HTTP Error 503: Service Unavailable" >&2'
			, '\texit 75'
			, 'fi'
			, 'echo "embuilder completed"'
		].join('\n')
	);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(attempts, 3);
	assert.match(result.stdout, /HTTP Error 503/);
	assert.match(result.stdout, /embuilder completed/);
	assert.match(result.stderr, /transient embuilder download failure/);
});

test('retry-embuilder preserves non-transient build failures', t => {
	const { result, attempts } = runRetry(
		t,
		'echo "wasm-ld: error: undefined symbol" >&2\nexit 23'
	);

	assert.equal(result.status, 23);
	assert.equal(attempts, 1);
	assert.match(result.stderr, /non-retryable error/);
});

test('retry-embuilder stops after the configured number of attempts', t => {
	const { result, attempts } = runRetry(
		t,
		'echo "http.client.RemoteDisconnected: Remote end closed connection without response" >&2\nexit 17'
	);

	assert.equal(result.status, 17);
	assert.equal(attempts, 3);
	assert.match(result.stderr, /failed after 3 attempts/);
});

test('SDL port builds use the retry wrapper', () => {
	const contents = fs.readFileSync(sdlMakefile, 'utf8');

	assert.doesNotMatch(contents, /\$\{DOCKER_RUN\} embuilder build/);
	assert.match(
		contents,
		/\$\{DOCKER_RUN\} retry-embuilder build sdl2 --lto --pic --verbose/
	);
	assert.match(
		contents,
		/\$\{DOCKER_RUN\} retry-embuilder build libGL-mt-webgl2-ofb-full_es3-getprocaddr --lto --pic --verbose/
	);
});
