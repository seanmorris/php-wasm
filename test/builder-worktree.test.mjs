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
const builderScript = path.join(repoRoot, 'bin/php-wasm-builder.js');
const runtimePackages = [
	'php-wasm'
	, 'php-cgi-wasm'
	, 'php-cli-wasm'
	, 'php-dbg-wasm'
];
const inheritedMakeCases = [
	{ name: 'source environment', flags: {} }
	, { name: 'debug flags', flags: { MAKEFLAGS: '--debug=basic', MFLAGS: '--debug=basic' } }
	, { name: 'command-line overrides'
		, flags: {
			MAKEFLAGS: '-- PHP_VERSION=8.3 LIB_TYPE=dynamic'
			, MAKEOVERRIDES: '${-*-command-variables-*-}'
		}
	}
	, { name: 'debug flags and overrides'
		, flags: {
			MAKEFLAGS: '--debug=basic -- PHP_VERSION=8.3 LIB_TYPE=dynamic'
			, MFLAGS: '--debug=basic'
			, MAKEOVERRIDES: '${-*-command-variables-*-}'
		}
	}
	, { name: 'GNU-specific debug flags', flags: { GNUMAKEFLAGS: '--debug=basic' } }
];

/**
 * Construct a contaminated outer-Make environment for subprocess regressions.
 * @param {object} flags Invocation state to add to the environment.
 * @returns {object} Environment passed unchanged to the process under test.
 */
function inheritedMakeEnvironment(flags = {})
{
	return {
		...process.env,
		MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: '', MAKELEVEL: '2', GNUMAKEFLAGS: ''
		, PHP_VERSION: '8.3', LIB_TYPE: 'dynamic'
		, ...flags
	};
}

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
			...independentMakeEnvironment(),
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

test('independent Make environments explicitly clear invocation state and preserve configuration', () => {
	const original = inheritedMakeEnvironment({
		MAKEFLAGS: '--debug=basic -- PHP_VERSION=8.3'
		, MAKEFILES: '/fixture/config.mak'
		, ENV_FILE: '/fixture/.php-wasm-rc'
		, PHP_ASSET_DIR: '/fixture/assets'
	});
	const environment = independentMakeEnvironment(original);
	const controls = ['MAKEFLAGS', 'MFLAGS', 'MAKEOVERRIDES', 'MAKELEVEL', 'GNUMAKEFLAGS'];

	assert.notEqual(environment, original);
	assert.equal(original.MAKEFLAGS, '--debug=basic -- PHP_VERSION=8.3');

	for(const key of controls)
	{
		assert.ok(Object.hasOwn(environment, key), `${key} must not be omitted: Deno restores omitted parent keys`);
		assert.equal(environment[key], '', key);
	}

	for(const key of Object.keys(original).filter(key => !controls.includes(key)))
	{
		assert.equal(environment[key], original[key], `${key} must retain its original configuration value`);
	}
});

test('independent Make queries separate inherited flags and overrides from PHP environment settings', async t => {
	for(const { name, flags } of inheritedMakeCases)
	{
		await t.test(name, () => {
			const environment = independentMakeEnvironment(inheritedMakeEnvironment(flags));
			const options = ['--no-print-directory', '-f', 'info.mak', 'get-php-version', 'ENV_FILE=/dev/null'];
			const configured = spawnSync('make', options, { cwd: repoRoot, encoding: 'utf8', env: environment });
			const fallback = spawnSync('make', ['--eval=undefine PHP_VERSION', ...options], {
				cwd: repoRoot, encoding: 'utf8', env: environment
			});

			assert.equal(configured.status, 0, configured.stderr);
			assert.equal(configured.stdout.trim(), '8.3', 'ordinary environment configuration must remain available');
			assert.equal(fallback.status, 0, fallback.stderr);
			assert.equal(fallback.stdout.trim(), '8.4', 'the default query must not inherit command-line overrides');
		});
	}
});

test('normal builder builds preserve inherited Make invocation state and configuration', t => {
	const { workspaceDir, binDir } = createBuilderWorkspace(t);
	const values = {
		MAKEFLAGS: '--debug=basic -- PHP_VERSION=8.3'
		, MFLAGS: '--debug=basic', MAKEOVERRIDES: '${-*-command-variables-*-}'
		, MAKELEVEL: '2'
		, GNUMAKEFLAGS: '--warn-undefined-variables', MAKEFILES: '/fixture/config.mak'
		, PHP_VERSION: '8.3', LIB_TYPE: 'shared', PHP_ASSET_DIR: '/fixture/assets'
	};
	writeExecutable(path.join(binDir, 'make'), '#!/usr/bin/env node\n'
		+ `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(values))}.map(key => [key, process.env[key]]))));\n`);
	const result = spawnSync('node', [builderScript, 'build', 'node', 'mjs'], {
		cwd: workspaceDir, encoding: 'utf8'
		, env: { ...process.env, ...values, PATH: `${binDir}:${process.env.PATH ?? ''}` }
	});

	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout), values);
});

/**
 * Exercise production prerequisites while replacing expensive build recipes.
 * @param {object} t Node test context.
 * @param {object} options Target and waitline configuration.
 * @param {string} options.target Test target to exercise.
 * @param {number} [options.enabled] Explicit waitline flag; omit to test its default.
 * @param {boolean} [options.omitDependency] Remove the production rule as a negative control.
 * @returns {object} Make result and observed fixture outputs.
 */
function runWaitlineMakeFixture(t, { target, enabled, omitDependency = false })
{
	const { workspaceDir, env } = createMakeWorkspace(t, 'php-wasm-waitline-deps-');
	const packageDir = path.join(workspaceDir, 'waitline');
	fs.mkdirSync(packageDir);
	const preMake = fs.readFileSync(path.join(repoRoot, 'packages/waitline/pre.mak'), 'utf8');
	const dependency = /^test-node test-node-standard test-node-cjs test-node-cjs-standard test-deno: node-cli-mjs\r?\n/m;
	if(omitDependency) assert.match(preMake, dependency, 'The negative control must remove the actual prerequisite rule');
	fs.writeFileSync(path.join(packageDir, 'pre.mak'), omitDependency ? preMake.replace(dependency, '') : preMake);
	writeExecutable(path.join(workspaceDir, 'bin/npm'), '#!/usr/bin/env bash\nprintf "%s\\n" "$WAITLINE_FIXTURE_PACKAGE"\n');
	const overrides = path.join(workspaceDir, 'recipes.mak');
	// Override recipes, not prerequisites: the production Make graph decides
	// whether CLI MJS is built before the test recipe can consume it.
	fs.writeFileSync(overrides, `
node-mjs node-cgi-mjs node-js node-cli-js node-dbg-js node-dbg-mjs:
\t@:
node-cli-mjs:
\t@printf 'built\\n' > '\${PHP_BUILDER_DIR}/cli-mjs'
test-node test-node-standard test-node-cjs test-node-cjs-standard test-deno test-bun test-browser:
\t@printf '%s\\n' '\${TEST_LIST}' > '\${PHP_BUILDER_DIR}/tests'
\t@if test '\${WITH_WAITLINE}' = 1 && test '$@' != test-bun && test '$@' != test-browser; then test -f '\${PHP_BUILDER_DIR}/cli-mjs' || { echo 'CLI MJS prerequisite missing' >&2; exit 23; }; fi
`);
	const cleanEnv = { ...env, WAITLINE_FIXTURE_PACKAGE: packageDir };
	delete cleanEnv.WITH_WAITLINE;
	// Deno 2.5.6 merges omitted child env keys with the parent environment.
	const waitlineArgument = enabled === undefined
		? '--eval=undefine WITH_WAITLINE'
		: `WITH_WAITLINE=${enabled}`;
	const result = spawnSync('make', [
		'--no-print-directory', '-j4', '-f', 'Makefile', '-f', overrides
		, 'ENV_FILE=/dev/null', 'PHP_VERSION=8.3', `PHP_BUILDER_DIR=${workspaceDir}`
		, waitlineArgument, target
	], { cwd: repoRoot, encoding: 'utf8', env: cleanEnv });
	return {
		result
		, cliBuilt: fs.existsSync(path.join(workspaceDir, 'cli-mjs'))
		, tests: fs.existsSync(path.join(workspaceDir, 'tests')) ? fs.readFileSync(path.join(workspaceDir, 'tests'), 'utf8') : ''
	};
}

const waitlineTestTargets = ['test-node', 'test-node-standard', 'test-node-cjs', 'test-node-cjs-standard', 'test-deno'];

test('every waitline TEST_LIST consumer builds CLI MJS before clean parallel tests', t => {
	for(const target of waitlineTestTargets)
	{
		const { result, cliBuilt, tests } = runWaitlineMakeFixture(t, { target, enabled: 1 });
		assert.equal(result.status, 0, `${target}: ${result.stdout}${result.stderr}`);
		assert.equal(cliBuilt, true, target);
		assert.match(tests, /packages\/waitline\/test\/basic\.mjs/, target);
	}
});

test('disabled and default waitline preserve existing runtime prerequisites', t => {
	const previous = process.env.WITH_WAITLINE;
	process.env.WITH_WAITLINE = '1';

	try
	{
		for(const enabled of [0, undefined])
		{
			for(const target of waitlineTestTargets)
			{
				const { result, cliBuilt, tests } = runWaitlineMakeFixture(t, { target, enabled });
				const label = `${target} (WITH_WAITLINE=${enabled ?? 'unset'})`;
				assert.equal(result.status, 0, `${label}: ${result.stdout}${result.stderr}`);
				assert.equal(cliBuilt, target === 'test-node-standard', label);
				assert.doesNotMatch(tests, /packages\/waitline\/test\//, label);
			}
		}
	}
	finally
	{
		if(previous === undefined) delete process.env.WITH_WAITLINE;
		else process.env.WITH_WAITLINE = previous;
	}
});

test('waitline does not add CLI prerequisites to focused Bun or browser tests', t => {
	for(const target of ['test-bun', 'test-browser'])
	{
		const { result, cliBuilt } = runWaitlineMakeFixture(t, { target, enabled: 1 });
		assert.equal(result.status, 0, `${target}: ${result.stdout}${result.stderr}`);
		assert.equal(cliBuilt, false, target);
	}
});

test('waitline dependency regression rejects the original missing-prerequisite graph', t => {
	for(const target of waitlineTestTargets.filter(target => target !== 'test-node-standard'))
	{
		const { result, cliBuilt } = runWaitlineMakeFixture(t, { target, enabled: 1, omitDependency: true });
		assert.notEqual(result.status, 0, target);
		assert.match(result.stderr, /CLI MJS prerequisite missing/, target);
		assert.equal(cliBuilt, false, target);
	}
});

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
			, env: independentMakeEnvironment()
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
			, env: independentMakeEnvironment()
		}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), '8.4');
});

/**
 * Create isolated package assets and a CLI launcher that preserves its input env.
 * @param {object} t Test context owning the fixture cleanup.
 * @param {object} options Fixture configuration.
 * @param {boolean} [options.withRc] Include a workspace PHP configuration file.
 * @returns {object} Fixture paths and the production CLI launcher.
 */
function createCopyAssetsWorkspace(t, { withRc = true } = {})
{
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
	if(withRc)
	{
		fs.writeFileSync(
			rcFile,
			[
				'PHP_VERSION=8.4'
				, 'PHP_ASSET_DIR=./public/assets'
				, ''
			].join('\n'),
			'utf8'
		);
	}

	return {
		workspaceDir, binDir, outputDir
		, run: (environment = process.env, executable = 'node') => spawnSync(executable, [builderScript, 'copy-assets'], {
			cwd: workspaceDir
			, encoding: 'utf8'
			, env: {
				...environment,
				PATH: `${binDir}:${environment.PATH ?? ''}`
				, WORKSPACE_DIR: workspaceDir
			}
		})
	};
}

test('php-wasm-builder copy-assets copies shared libraries and data files into PHP_ASSET_DIR in the workspace', async t => {
	for(const { name, flags } of inheritedMakeCases)
	{
		await t.test(name, t => {
			const { outputDir, run } = createCopyAssetsWorkspace(t);
			// Do not isolate this launcher: the production metadata queries must do it.
			const result = run(inheritedMakeEnvironment(flags));

			assert.equal(result.status, 0, result.stderr);
			assert.ok(fs.existsSync(path.join(outputDir, 'root-support.dat')));
			assert.ok(fs.existsSync(path.join(outputDir, 'libexample.so')));
			assert.ok(fs.existsSync(path.join(outputDir, 'php8.4-example.so')));
			assert.ok(fs.existsSync(path.join(outputDir, 'example.dat')));
			assert.ok(!fs.existsSync(path.join(outputDir, 'php8.3-example.so')));
		});
	}
});

test('copy-assets preserves environment configuration when no rc file selects a PHP version', t => {
	const { outputDir, run } = createCopyAssetsWorkspace(t, { withRc: false });
	const result = run(inheritedMakeEnvironment({ ENV_FILE: '/dev/null', PHP_ASSET_DIR: './public/assets' }));

	assert.equal(result.status, 0, result.stderr);
	assert.ok(fs.existsSync(path.join(outputDir, 'php8.3-example.so')));
	assert.ok(!fs.existsSync(path.join(outputDir, 'php8.4-example.so')));
});

test('copy-assets rejects failed or invalid metadata before creating the asset destination', async t => {
	const failures = [
		{ name: 'nonzero status', script: 'echo fixture-query-error >&2; exit 23', error: /exit status 23.*fixture-query-error/ }
		, { name: 'signal', script: 'kill -TERM $$', error: /signal SIGTERM/ }
		, { name: 'empty output', script: 'exit 0', error: /empty output/ }
		, { name: 'multiline output', script: 'printf "first\\nsecond\\n"; exit 0', error: /multiline output/ }
	];

	for(const target of ['get-asset-path', 'get-php-version'])
	{
		for(const { name, script, error } of failures)
		{
			await t.test(`${target}: ${name}`, t => {
				const { binDir, outputDir, run } = createCopyAssetsWorkspace(t);
				writeExecutable(path.join(binDir, 'make'), `#!/usr/bin/env bash
if [ "$1" = '${target}' ]; then
  ${script}
fi
case "$1" in
  get-asset-path) printf '%s\\n' "$WORKSPACE_DIR/public/assets" ;;
  get-php-version) printf '8.4\\n' ;;
esac
`);
				const result = run();

				assert.equal(result.status, 1);
				assert.match(result.stderr, new RegExp(`Make query ${target}`));
				assert.match(result.stderr, error);
				assert.equal(fs.existsSync(outputDir), false, 'invalid metadata must not create an asset destination');
			});
		}
	}

	await t.test('spawn error', t => {
		const { binDir, outputDir, run } = createCopyAssetsWorkspace(t);
		const node = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' });
		assert.equal(node.status, 0, node.stderr);
		fs.symlinkSync('/bin/bash', path.join(binDir, 'bash'));
		// Use the already-permitted Node executable, but do not let PATH find Make.
		const result = run({ ...process.env, PATH: binDir }, node.stdout.trim());

		assert.equal(result.status, 1, result.error?.message ?? result.stderr);
		assert.match(result.stderr, /Make query get-asset-path failed:.*ENOENT/);
		assert.equal(fs.existsSync(outputDir), false);
	});
});
