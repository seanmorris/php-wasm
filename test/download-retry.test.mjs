import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const retryScript = path.join(repoRoot, '.github/bin/retry-download.sh');

/**
 * Write an executable fixture.
 * @param {string} filePath Destination path.
 * @param {string} contents Fixture contents.
 * @returns {void} Nothing.
 */
function writeExecutable(filePath, contents)
{
	fs.writeFileSync(filePath, contents, 'utf8');
	fs.chmodSync(filePath, 0o755);
}

/**
 * Run retry-download against a fake curl command.
 * @param {import('node:test').TestContext} t Test context.
 * @param {string} curlBody Fake curl implementation body.
 * @param {number} maxAttempts Maximum attempts.
 * @param {string | undefined} initialContents Existing output contents.
 * @returns {{result: import('node:child_process').SpawnSyncReturns<string>, attempts: number, outputFile: string, workspaceDir: string}} Retry result and fixture paths.
 */
function runRetry(t, curlBody, maxAttempts = 3, initialContents = undefined)
{
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-download-retry-'));
	const binDir = path.join(workspaceDir, 'bin');
	const countFile = path.join(workspaceDir, 'attempts');
	const outputFile = path.join(workspaceDir, 'archive.tgz');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	fs.mkdirSync(binDir, { recursive: true });
	if(initialContents !== undefined)
	{
		fs.writeFileSync(outputFile, initialContents, 'utf8');
	}

	writeExecutable(
		path.join(binDir, 'curl'),
		[
			'#!/usr/bin/env bash'
			, 'set -euo pipefail'
			, 'count=0'
			, 'output_file='
			, 'if [[ -f "${DOWNLOAD_TEST_COUNT}" ]]; then'
			, '\tcount="$(<"${DOWNLOAD_TEST_COUNT}")"'
			, 'fi'
			, 'count=$((count + 1))'
			, 'printf \'%s\\n\' "${count}" > "${DOWNLOAD_TEST_COUNT}"'
			, 'while (( $# > 0 )); do'
			, '\tif [[ "$1" == --output ]]; then'
			, '\t\toutput_file="$2"'
			, '\t\tshift 2'
			, '\t\tcontinue'
			, '\tfi'
			, '\tshift'
			, 'done'
			, curlBody
			, ''
		].join('\n')
	);

	const result = spawnSync(
		'bash',
		[retryScript, 'https://example.invalid/archive.tgz', outputFile],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env: {
				...process.env
				, PATH: `${binDir}:${process.env.PATH ?? ''}`
				, DOWNLOAD_TEST_COUNT: countFile
				, DOWNLOAD_RETRY_ATTEMPTS: String(maxAttempts)
				, DOWNLOAD_RETRY_DELAY_SECONDS: '0'
			}
		}
	);

	return {
		result
		, attempts: Number(fs.readFileSync(countFile, 'utf8').trim())
		, outputFile
		, workspaceDir
	};
}

test('retry-download retries transport failures and publishes atomically', t => {
	const { result, attempts, outputFile, workspaceDir } = runRetry(
		t,
		[
			'if (( count < 3 )); then'
			, '\techo "temporary network failure" >&2'
			, '\texit 6'
			, 'fi'
			, 'printf \'downloaded\\n\' > "${output_file}"'
		].join('\n')
	);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(attempts, 3);
	assert.equal(fs.readFileSync(outputFile, 'utf8'), 'downloaded\n');
	assert.deepEqual(
		fs.readdirSync(workspaceDir).filter(name => name.includes('.part.')),
		[]
	);
	assert.match(result.stderr, /retrying in 0 seconds/);
});

test('retry-download preserves an existing output after exhausted retries', t => {
	const { result, attempts, outputFile, workspaceDir } = runRetry(
		t,
		'printf \'partial\\n\' > "${output_file}"\nexit 7',
		2,
		'existing\n'
	);

	assert.equal(result.status, 7);
	assert.equal(attempts, 2);
	assert.equal(fs.readFileSync(outputFile, 'utf8'), 'existing\n');
	assert.deepEqual(
		fs.readdirSync(workspaceDir).filter(name => name.includes('.part.')),
		[]
	);
});

test('PECL extension downloads use retry-download', () => {
	for(const makefile of ['packages/sdl/static.mak', 'packages/libyaml/static.mak'])
	{
		const contents = fs.readFileSync(path.join(repoRoot, makefile), 'utf8');

		assert.match(contents, /\/src\/\.github\/bin\/retry-download\.sh https:\/\/pecl\.php\.net\/get\//);
		assert.doesNotMatch(contents, /wget .*https:\/\/pecl\.php\.net\/get\//);
	}
});
