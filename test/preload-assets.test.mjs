import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import makeEnvironment from '../bin/make-environment.cjs';

const { independentMakeEnvironment } = makeEnvironment;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeRegExp(value)
{
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('builder-mode PRELOAD_ASSETS keeps anchored paths and resolves relative paths from PHP_BUILDER_DIR', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-preload-assets-'));
	const absoluteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-preload-absolute-'));
	const homeDir = path.join(workspaceDir, 'home');
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
	fs.mkdirSync(publicDir, { recursive: true });
	fs.mkdirSync(relativeDir, { recursive: true });

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
			, 'EXTENSION_PACKAGE_DIRS='
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env: {
				...independentMakeEnvironment(),
				HOME: homeDir
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

test('package pre.mak additions remain available to builder preload collection', t => {
	const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-preload-package-'));
	const intlPackageDir = path.join(repoRoot, 'packages/intl');

	t.after(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	const result = spawnSync(
		'make',
		[
			'--no-print-directory'
			, '--silent'
			, '-f'
			, 'Makefile'
			, 'WITH_INTL=static'
			, `PHP_BUILDER_DIR=${workspaceDir}`
			, `EXTENSION_PACKAGE_DIRS=${intlPackageDir}`
			, '--eval=.PHONY: print-preload-assets\nprint-preload-assets:\n\t@printf "%s\\n" "$(PRELOAD_ASSET_SOURCES)"'
			, 'print-preload-assets'
		],
		{
			cwd: repoRoot
			, encoding: 'utf8'
			, env: independentMakeEnvironment()
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		result.stdout.trim(),
		path.join(workspaceDir, 'lib/share/icu/72.1/icudt72l.dat')
	);
});

test('preload output uses the selected asset directory in source and builder layouts', async t => {
	for(const layout of ['relative', 'absolute', 'separate assets', 'workspace', 'builder relative', 'builder absolute'])
	{
		await t.test(layout, () => {
			const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-preload-output-'));
			try
			{
				const project = path.join(fixture, 'project');
				const native = path.join(fixture, 'native');
				const source = path.join(native, 'third_party/php8.4-src/sapi/cli/php.data');
				const configuration = path.join(fixture, 'settings.mak');
				const contents = Buffer.from([0, 1, 127, 128, 255]);
				const absolute = path.join(project, 'assets');
				const builder = layout.startsWith('builder ');
				const assetDirectory = layout === 'relative'
					? path.join(native, 'dist')
					: layout === 'workspace' ? path.join(project, 'packages/php-wasm') : absolute;
				const settings = {
					relative: 'PHP_DIST_DIR=dist'
					, absolute: `PHP_DIST_DIR=${absolute}`
					, 'separate assets': `PHP_DIST_DIR=dist\nPHP_ASSET_DIR=${absolute}`
					, workspace: `ENV_DIR=${project}`
					, 'builder relative': 'PHP_DIST_DIR=dist\nPHP_ASSET_DIR=assets'
					, 'builder absolute': `PHP_DIST_DIR=dist\nPHP_ASSET_DIR=${absolute}`
				};
				fs.mkdirSync(path.dirname(source), {recursive: true});
				fs.mkdirSync(assetDirectory, {recursive: true});
				fs.writeFileSync(source, contents);
				fs.writeFileSync(configuration, settings[layout] + '\n');
				// Native linking has already created php.data. Exercise the actual
				// staging recipe while leaving collection and native compilation idle.
				const target = layout === 'relative' ? 'dist/php.data' : path.join(assetDirectory, 'php.data');
				const args = [
					'--no-print-directory', '-f', path.join(repoRoot, 'Makefile')
					, '--old-file=.cache/preload-collected', 'MAKE_SHUFFLE='
					, 'BUILD_WORKSPACE=', 'EXTENSION_PACKAGE_DIRS=', 'PHP_VERSION=8.4'
					, `ENV_FILE=${configuration}`, `PHP_BUILDER_DIR=${builder ? project : ''}`
					, target
				];
				const options = {cwd: native, encoding: 'utf8', env: independentMakeEnvironment()};
				const result = spawnSync('make', args, options);
				assert.equal(result.status, 0, result.stdout + result.stderr);
				const output = path.join(assetDirectory, 'php.data');
				assert.deepEqual(fs.readFileSync(output), contents);
				const timestamp = fs.statSync(output).mtimeMs;
				const repeated = spawnSync('make', args, options);
				assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
				assert.doesNotMatch(repeated.stdout, /^cp /m);
				assert.equal(fs.statSync(output).mtimeMs, timestamp);
				assert.deepEqual(fs.readFileSync(output), contents);

				fs.rmSync(output);
				fs.rmSync(source);
				const missing = spawnSync('make', args, options);
				assert.notEqual(missing.status, 0, 'Missing linker output must fail staging');
				assert.equal(fs.existsSync(output), false);
			}
			finally
			{
				fs.rmSync(fixture, {recursive: true, force: true});
			}
		});
	}
});
