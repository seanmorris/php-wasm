import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the packed builder includes Make isolation and download helpers without shipping workflows', t => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-builder-tools-pack-'));
	t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
	const fixture = path.join(temporary, 'builder');
	fs.mkdirSync(path.join(fixture, '.github/bin'), { recursive: true });
	fs.mkdirSync(path.join(fixture, '.github/workflows'));
	for(const name of ['package.json', '.npmignore'])
	{
		fs.copyFileSync(path.join(repoRoot, name), path.join(fixture, name));
	}
	// Use the actual shipping rules and scripts without packing local PHP builds.
	fs.cpSync(path.join(repoRoot, 'bin'), path.join(fixture, 'bin'), { recursive: true });
	fs.copyFileSync(path.join(repoRoot, '.github/bin/retry-download.sh'), path.join(fixture, '.github/bin/retry-download.sh'));
	fs.writeFileSync(path.join(fixture, '.github/workflows/not-for-package.yaml'), 'name: packaging sentinel\n');
	fs.writeFileSync(path.join(fixture, '.github/bin/not-for-package.sh'), 'exit 1\n');
	const [packed] = JSON.parse(execFileSync('npm', [
		'pack', '--json', '--pack-destination', temporary
		, '--cache', path.join(temporary, 'npm-cache')
	], { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
	const files = new Set(execFileSync('tar', ['-tzf', path.join(temporary, packed.filename)], {
		encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
	}).trim().split('\n'));
	for(const name of ['bin/php-wasm-builder.js', 'bin/make-environment.cjs', '.github/bin/retry-download.sh'])
	{
		assert.ok(files.has(`package/${name}`), `Missing packed helper: ${name}`);
	}
	assert.equal(files.has('package/.github/workflows/not-for-package.yaml'), false);
	assert.equal(files.has('package/.github/bin/not-for-package.sh'), false);
});
