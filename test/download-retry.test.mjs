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
 * @param {string[]} [fallbackUrls] Alternate sources sharing the attempt budget.
 * @returns {{result: import('node:child_process').SpawnSyncReturns<string>, attempts: number, outputFile: string, workspaceDir: string}} Retry result and fixture paths.
 */
function runRetry(t, curlBody, maxAttempts = 3, initialContents = undefined, fallbackUrls = [])
{
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-download-retry-'));
	const binDir = path.join(workspaceDir, 'bin');
	const countFile = path.join(workspaceDir, 'attempts');
	const urlsFile = path.join(workspaceDir, 'urls');
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
			, 'request_url='
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
			, '\tif [[ "$1" == https://* ]]; then request_url="$1"; fi'
			, '\tshift'
			, 'done'
			, 'printf \'%s\\n\' "${request_url}" >> "${DOWNLOAD_TEST_URLS}"'
			, curlBody
			, ''
		].join('\n')
	);

	const result = spawnSync(
		'bash',
		[retryScript, 'https://example.invalid/archive.tgz', outputFile, ...fallbackUrls],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env: {
				...process.env
				, PATH: `${binDir}:${process.env.PATH ?? ''}`
				, DOWNLOAD_TEST_COUNT: countFile
				, DOWNLOAD_TEST_URLS: urlsFile
				, DOWNLOAD_RETRY_ATTEMPTS: String(maxAttempts)
				, DOWNLOAD_RETRY_DELAY_SECONDS: '0'
			}
		}
	);

	return {
		result
		, attempts: Number(fs.readFileSync(countFile, 'utf8').trim())
		, urls: fs.readFileSync(urlsFile, 'utf8').trim().split('\n')
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
	for(const makefile of ['packages/php-sdl-wasm/static.mak', 'packages/libyaml/static.mak'])
	{
		const contents = fs.readFileSync(path.join(repoRoot, makefile), 'utf8');

		assert.match(contents, /\/src\/\.github\/bin\/retry-download\.sh https:\/\/pecl\.php\.net\/get\//);
		assert.doesNotMatch(contents, /wget .*https:\/\/pecl\.php\.net\/get\//);
	}
});

test('FreeType retains its version and primary source with an official release mirror fallback', () => {
	const contents = fs.readFileSync(path.join(repoRoot, 'packages/gd/static.mak'), 'utf8');
	const recipe = contents.slice(contents.indexOf('third_party/freetype-${FREETYPE_VERSION}/README:\n')).split('\n\n')[0].replace(/\\\n\s*/g, ' ');

	assert.match(contents, /FREETYPE_VERSION\?=2\.10\.0/);
	assert.match(recipe, /\/src\/\.github\/bin\/retry-download\.sh\s+https:\/\/download-mirror\.savannah\.gnu\.org\/releases\/freetype\/freetype-\$\{FREETYPE_VERSION\}\.tar\.gz\s+freetype-\$\{FREETYPE_VERSION\}\.tar\.gz\s+https:\/\/downloads\.sourceforge\.net\/project\/freetype\/freetype2\/\$\{FREETYPE_VERSION\}\/freetype-\$\{FREETYPE_VERSION\}\.tar\.gz/);
	assert.doesNotMatch(contents, /wget .*freetype-/);
});

test('retry-download switches to a fallback after a failed primary without publishing partial bytes', t => {
	const fallback = 'https://mirror.invalid/archive.tgz';
	const { result, attempts, urls, outputFile, workspaceDir } = runRetry(t, [
		'if [[ "$request_url" == https://example.invalid/* ]]; then'
		, '\tprintf partial > "$output_file"'
		, '\texit 28'
		, 'fi'
		, 'printf "complete\\n" > "$output_file"'
	].join('\n'), 3, undefined, [fallback]);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(attempts, 2);
	assert.deepEqual(urls, ['https://example.invalid/archive.tgz', fallback]);
	assert.equal(fs.readFileSync(outputFile, 'utf8'), 'complete\n');
	assert.deepEqual(fs.readdirSync(workspaceDir).filter(name => name.includes('.part.')), []);
});

test('retry-download does not contact fallback sources when the primary succeeds', t => {
	const { result, attempts, urls } = runRetry(t, 'printf complete > "$output_file"', 3, undefined, ['https://mirror.invalid/archive.tgz']);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(attempts, 1);
	assert.deepEqual(urls, ['https://example.invalid/archive.tgz']);
});

test('retry-download bounds attempts across all mirrors and preserves existing output on failure', t => {
	const fallback = 'https://mirror.invalid/archive.tgz';
	for(const budget of [1, 3])
	{
		const { result, attempts, urls, outputFile, workspaceDir } = runRetry(t,
			'printf partial > "$output_file"; exit 7', budget, 'existing\n', [fallback]);
		assert.equal(result.status, 7);
		assert.equal(attempts, budget);
		assert.deepEqual(urls, ['https://example.invalid/archive.tgz', fallback, 'https://example.invalid/archive.tgz'].slice(0, budget));
		assert.equal(fs.readFileSync(outputFile, 'utf8'), 'existing\n');
		assert.deepEqual(fs.readdirSync(workspaceDir).filter(name => name.includes('.part.')), []);
	}
});
