import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/test-cgi-node-step.yaml'), 'utf8');
const nodeWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/test-node-step.yaml'), 'utf8');
const testWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/test.yaml'), 'utf8');
const artifactWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/build.yaml'), 'utf8');
const guardPath = path.join(repoRoot, '.github/bin/verify-builder-git.sh');
const guard = fs.readFileSync(guardPath, 'utf8');
const builderImage = process.env.BUILDER_GIT_TEST_IMAGE;

/**
 * Extract a named top-level workflow step without a YAML runtime dependency.
 * @param {string} contents Workflow source.
 * @param {string} name Step name.
 * @returns {string} Step source, including its name.
 */
function step(contents, name)
{
	const marker = `      - name: ${name}\n`;
	const start = contents.indexOf(marker);
	assert.notEqual(start, -1, `Missing step: ${name}`);
	const end = contents.indexOf('\n      - ', start + marker.length);
	return contents.slice(start, end === -1 ? undefined : end);
}

/**
 * Check the image and executable preparation required before CGI tests.
 * @param {string} contents Workflow source.
 * @returns {void} Nothing.
 */
function assertPreparedBuilder(contents)
{
	const names = [
		'Cache Docker image'
		, 'Load builder image if cached'
		, 'Create builder image (if not cached)'
		, 'Verify Docker Compose', 'Verify builder Git cache ownership support'
		, 'Download Artifact'
		, 'Extract Artifact'
		, 'Flatten mtimes after extraction'
		, 'Apply executable cache'
		, 'Run tests'
	];
	const steps = names.map(name => step(contents, name));
	const positions = steps.map(value => contents.indexOf(value));
	assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'Builder and artifacts must be prepared before tests');
	const [cache, load, build, compose, git, , , , executable] = steps;
	assert.match(cache, /id: cache-docker-image\n/);
	assert.match(cache, /uses: actions\/cache@v5\n/);
	assert.match(cache, /path: \/tmp\/builder-image\.tar\n/);
	assert.equal(cache.match(/^          key: (.+)$/m)?.[1], step(nodeWorkflow, names[0]).match(/^          key: (.+)$/m)?.[1]);
	assert.match(load, /if: steps\.cache-docker-image\.outputs\.cache-hit == 'true'\n/);
	assert.match(load, /docker load -i \/tmp\/builder-image\.tar/);
	assert.match(build, /if: steps\.cache-docker-image\.outputs\.cache-hit != 'true'\n/);
	assert.match(build, /make --debug=basic image\n/);
	assert.match(build, /docker save -o \/tmp\/builder-image\.tar seanmorris\/php-emscripten-builder:latest/);
	assert.match(compose, /run: docker compose version/);
	assert.match(git, /run: bash \.github\/bin\/verify-builder-git\.sh/);
	assert.doesNotMatch(git, /^        if:/m, 'Ownership support must be checked for cached and freshly built images');
	assert.match(executable, /shopt -s nullglob/);
	assert.match(executable, /for CACHE in \.\/\.cache\/executables-\*; do/);
	assert.match(executable, /xargs -r -a "\$\{CACHE\}" chmod \+x/);
}

test('CGI prepares the current builder with the Node cache key and restores executables', () => {
	assertPreparedBuilder(workflow);
});

test('CGI preparation contract rejects missing steps, wrong ordering and stale cache handling', () => {
	const mutations = [
		workflow.replace(step(workflow, 'Load builder image if cached'), '')
		, workflow.replace("cache-hit == 'true'", "cache-hit != 'true'")
		, workflow.replace("cache-hit != 'true'", "cache-hit == 'true'")
		, workflow.replace("'emscripten-builder.dockerfile'", "'obsolete-builder.dockerfile'")
		, workflow.replace('docker load -i /tmp/builder-image.tar', 'docker pull seanmorris/php-emscripten-builder:latest')
		, workflow.replace('time make --debug=basic image', 'docker pull seanmorris/php-emscripten-builder:latest')
		, workflow.replace('shopt -s nullglob', 'true')
		, workflow.replace('xargs -r -a "${CACHE}" chmod +x', 'true')
		, workflow.replace('run: bash .github/bin/verify-builder-git.sh', "if: steps.cache-docker-image.outputs.cache-hit != 'true'\n        run: bash .github/bin/verify-builder-git.sh")
	];
	for(const [first, second] of [
		['Cache Docker image', 'Load builder image if cached']
		, ['Create builder image (if not cached)', 'Verify builder Git cache ownership support']
		, ['Extract Artifact', 'Apply executable cache']
		, ['Apply executable cache', 'Run tests']
	]){
		const a = step(workflow, first);
		const b = step(workflow, second);
		mutations.push(workflow.replace(a, '__FIRST_STEP__').replace(b, a).replace('__FIRST_STEP__', b));
	}
	for(const contents of mutations) assert.throws(() => assertPreparedBuilder(contents));
});

/**
 * Check that the fast gate installs locked development dependencies before tests.
 * @param {string} contents Workflow source.
 * @returns {void} Nothing.
 */
function assertFastGateDependencies(contents)
{
	const gate = contents.split(/^  vrzno-importer:\n/m)[1]?.split(/^  [\w-]+:\n/m)[0];
	assert.ok(gate, 'The build infrastructure gate must exist');
	const install = step(gate, 'Install locked dependencies');
	const node = step(gate, 'Test build helpers under inherited Make settings (Node)');
	const deno = step(gate, 'Test build helpers under inherited Make settings (Deno)');
	const bun = step(gate, 'Test build helpers under inherited Make settings (Bun)');
	const installBun = step(gate, 'Install Bun');
	const setup = gate.indexOf('      - uses: actions/setup-node@v6\n');
	assert.notEqual(setup, -1, 'The gate must prepare Node before installing dependencies');
	assert.ok(setup < gate.indexOf(install), 'Dependencies must use the prepared Node version');
	assert.match(install, /^        run: npm ci$/m, 'Install the lockfile, including the Node types used by Deno');
	assert.doesNotMatch(install, /^        (?:if|working-directory):/m, 'Every gate run needs the root development dependencies');
	for(const consumer of [node, deno, bun])
	{
		assert.ok(gate.indexOf(install) < gate.indexOf(consumer), 'Install dependencies before each runtime test suite');
		assert.match(consumer, /test\/cgi-builder-workflow\.test\.mjs/, 'The gate must run its own preparation regression');
	}
	assert.match(node, /^        run: node --test /m);
	assert.match(deno, /^        run: deno test /m);
	assert.doesNotMatch(deno, /--no-check\b/, 'Do not suppress typechecking to hide missing development dependencies');
	assert.match(installBun, /uses: oven-sh\/setup-bun@v2/);
	assert.match(installBun, /bun-version: 1\.4\.0/);
	assert.ok(gate.indexOf(installBun) < gate.indexOf(bun), 'Prepare pinned Bun before its tests');
	assert.match(bun, /^        run: bun test /m);
}

test('fast build gate prepares Node, typechecked Deno and pinned Bun tests', () => {
	assertFastGateDependencies(testWorkflow);
});

test('fast gate dependency contract rejects missing installs, late installs and disabled typechecking', () => {
	const install = step(testWorkflow, 'Install locked dependencies');
	const mutations = [
		testWorkflow.replace(install, '')
		, testWorkflow.replace('run: npm ci', 'run: npm install')
		, testWorkflow.replace('run: npm ci', 'run: npm ci --omit=dev')
		, testWorkflow.replace('run: npm ci', "if: false\n        run: npm ci")
		, testWorkflow.replace('run: deno test ', 'run: deno test --no-check ')
		, testWorkflow.replace(step(testWorkflow, 'Install Bun'), '')
	];
	for(const name of [
		'Test build helpers under inherited Make settings (Node)'
		, 'Test build helpers under inherited Make settings (Deno)'
		, 'Test build helpers under inherited Make settings (Bun)'
	]){
		const consumer = step(testWorkflow, name);
		mutations.push(testWorkflow.replace(install, '__INSTALL_STEP__').replace(consumer, install).replace('__INSTALL_STEP__', consumer));
	}
	for(const contents of mutations) assert.throws(() => assertFastGateDependencies(contents));
});

/**
 * Check every artifact test matrix against the supported runtimes and builds.
 * @param {string} contents Artifact workflow source.
 * @returns {void} Nothing.
 */
function assertRuntimeMatrices(contents)
{
	for(const libType of ['dynamic', 'shared', 'static'])
	{
		for(const compressed of [false, true])
		{
			const name = `test-node-${libType}${compressed ? '-compressed' : ''}`;
			const block = contents.split(new RegExp(`^  ${name}:\\n`, 'm'))[1]?.split(/^  [\w-]+:\n/m)[0];
			assert.ok(block, `Missing matrix: ${name}`);
			const axis = key => {
				const value = block.match(new RegExp(`^        ${key}: (\\[[^\\n]+\\])$`, 'm'))?.[1];
				assert.ok(value, `Missing ${name}.${key}`);
				return JSON.parse(value.replaceAll("'", '"'));
			};
			assert.deepEqual(axis('phpVersion'), ['8.5', '8.4', '8.3', '8.2', '8.1', '8.0'], name);
			assert.deepEqual(axis('testType'), ['node', 'deno', 'bun'], name);
			assert.deepEqual(axis('libType'), [libType], name);
			assert.match(block, /fail-fast: false/);
			assert.doesNotMatch(block, /continue-on-error|\bexclude:|\binclude:/, 'Every runtime must cover the same matrix');
			const artifact = compressed
				? 'php-compressed-${{ matrix.libType }}'
				: 'php-uncompressed-${{ matrix.phpVersion }}-${{ matrix.libType }}';
			assert.ok(block.includes(`artifactPattern: ${artifact}`), name);
		}
	}
}

test('Bun covers every Node/Deno artifact matrix and both standard module formats', () => {
	assertRuntimeMatrices(artifactWorkflow);
	assert.throws(() => assertRuntimeMatrices(artifactWorkflow.replace("testType: ['node', 'deno', 'bun']", "testType: ['node', 'deno']")));
	const run = step(nodeWorkflow, 'Run tests');
	assert.match(run, /inputs\.testType }}" = "node".*inputs\.testType }}" = "bun"/);
	assert.match(run, /make --debug=basic \$\{TARGET}-standard /);
	assert.match(run, /make --debug=basic \$\{TARGET}-cjs-standard /);
	assert.match(run, /make --debug=basic test-cgi-bun /);
	assert.match(run, /make --debug=basic test-cgi-bun-cjs /);
	assert.match(step(nodeWorkflow, 'Install Bun'), /bun-version: 1\.4\.0/);
	assert.equal((testWorkflow.match(/bun-version: 1\.4\.0/g) ?? []).length, 19, 'The build gate and all 18 make test jobs need Bun');
});

/**
 * Read the production test command without rebuilding native artifacts.
 * @param {string} target Make test target.
 * @param {string} libType Build type.
 * @returns {{command: string, files: string[]}} Planned command and test files.
 */
function runtimeTestPlan(target, libType)
{
	const result = spawnSync('make', [
		'--no-print-directory', '--dry-run'
		, ...[
			'node-mjs', 'node-cgi-mjs', 'node-cli-mjs', 'node-dbg-mjs'
			, 'node-js', 'node-cgi-js', 'node-cli-js', 'node-dbg-js'
		].flatMap(name => ['-o', name])
		, target, 'ENV_FILE=/dev/null', 'PHP_VERSION=8.3', `LIB_TYPE=${libType}`
		, 'EXTENSION_PACKAGE_DIRS=packages/waitline', 'WITH_WAITLINE=1'
		, 'SKIP_PACKAGING_TEST=0'
	], {
		cwd: repoRoot, encoding: 'utf8'
		, env: {...process.env, MAKEFLAGS: '', MFLAGS: '', GNUMAKEFLAGS: '', MAKEFILES: '', MAKELEVEL: '0'}
	});
	assert.equal(result.status, 0, `${target}: ${result.stdout}${result.stderr}`);
	return {command: result.stdout, files: result.stdout.match(/\.\/(?:packages|test)\/[^\s]+\.(?:mjs|cjs)\b/g) ?? []};
}

test('Bun and Node Make targets select identical ESM, CommonJS, extension, docs and packaging suites', () => {
	for(const libType of ['dynamic', 'shared', 'static'])
	{
		for(const suffix of ['', '-standard', '-cjs', '-cjs-standard'])
		{
			const node = runtimeTestPlan(`test-node${suffix}`, libType);
			const bun = runtimeTestPlan(`test-bun${suffix}`, libType);
			const label = `${libType}${suffix}`;
			assert.match(node.command, /node\s+--test\s/);
			assert.match(bun.command, /bun test --timeout 300000\s/);
			assert.deepEqual(bun.files, node.files, label);
			const extension = suffix.includes('-cjs') ? 'cjs' : 'mjs';
			assert.ok(bun.files.includes(`./test/basic.${extension}`), label);
			assert.ok(bun.files.includes('./packages/waitline/test/basic.mjs'), label);
			assert.equal(bun.files.includes(`./test/docs.test.${extension}`), libType === 'dynamic', label);
			assert.equal(bun.files.includes('./test/packaging.test.mjs'), extension === 'mjs', label);
			assert.equal(bun.files.includes(`./test/cli-node/cli-node.test.${extension}`), suffix.endsWith('-standard'), label);
			assert.equal(bun.files.includes(`./test/dbg-node/dbg-node.test.${extension}`), suffix.endsWith('-standard'), label);
			if(!suffix) assert.deepEqual(runtimeTestPlan('test-deno', libType).files, bun.files, libType);
		}
	}
});

test('Bun and Node CGI targets share the HTTP harness and matching documentation suites', () => {
	for(const libType of ['dynamic', 'shared', 'static'])
	{
		for(const suffix of ['', '-cjs'])
		{
			const node = runtimeTestPlan(`test-cgi-node${suffix}`, libType);
			const bun = runtimeTestPlan(`test-cgi-bun${suffix}`, libType);
			assert.match(node.command, /CGI_TEST_RUNTIME=node /);
			assert.match(bun.command, /CGI_TEST_RUNTIME=bun /);
			assert.match(bun.command, /test\/node-cgi-test\.sh/);
			assert.equal(bun.command.includes('TEST_FORMAT=cjs'), suffix === '-cjs');
			assert.deepEqual(bun.files, node.files);
			const extension = suffix ? 'cjs' : 'mjs';
			assert.deepEqual(bun.files, libType === 'dynamic' ? [`./test/docs-cgi.test.${extension}`] : []);
		}
	}
});

/**
 * Create a disposable directory for executable test fixtures.
 * @param {import('node:test').TestContext} t Test context.
 * @returns {string} Directory path.
 */
function temporary(t)
{
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-cgi-builder-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	return directory;
}

test('Git guard uses only the prepared image and isolated temporary container storage', t => {
	const directory = temporary(t);
	const fakeDocker = path.join(directory, 'docker');
	fs.writeFileSync(fakeDocker, `#!/usr/bin/env node
const fs = require('node:fs');
console.log(JSON.stringify({args: process.argv.slice(2), input: fs.readFileSync(0, 'utf8')}));
process.exit(Number(process.env.BUILDER_GIT_FAKE_EXIT || 0));
`);
	fs.chmodSync(fakeDocker, 0o755);
	const options = { encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}` } };
	const result = spawnSync('bash', [guardPath], options);
	assert.equal(result.status, 0, result.stderr);
	const invocation = JSON.parse(result.stdout);
	assert.deepEqual(invocation.args, [
		'run', '--rm', '--pull=never', '--read-only', '--network=none'
		, '--tmpfs'
		, '/tmp:rw,nosuid,nodev'
		, '--user'
		, '0:0'
		, '--entrypoint'
		, 'bash'
		, '-i'
		, 'seanmorris/php-emscripten-builder:latest', '-s'
	]);
	assert.match(invocation.input, /unset GIT_CONFIG_PARAMETERS SUDO_UID SUDO_GID/);
	assert.match(invocation.input, /GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=\/dev\/null GIT_CONFIG_COUNT=0/);
	assert.match(invocation.input, /git -c "safe\.directory=\$\{cache\}" -C "\$\{cache\}" rev-parse --is-bare-repository/);
	assert.doesNotMatch(invocation.input, /safe\.directory[^\n]*\*/);
	const failed = spawnSync('bash', [guardPath], {
		...options, env: { ...options.env, BUILDER_GIT_FAKE_EXIT: '42' }
	});
	assert.equal(failed.status, 42, 'Docker and Git probe failures must fail the workflow');
	const invalid = spawnSync('bash', [guardPath, 'image-one', 'image-two'], options);
	assert.equal(invalid.status, 2);
	assert.match(invalid.stderr, /Usage:/);
	assert.equal(invalid.stdout, '', 'Invalid arguments must not start a container');
});

test('current builder accepts command-scoped trust for a foreign-owned bare cache', {
	skip: !builderImage && 'Set BUILDER_GIT_TEST_IMAGE to exercise a prepared local image'
}, () => {
	const result = spawnSync('bash', [guardPath, builderImage], { encoding: 'utf8', timeout: 60000 });
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /Builder Git cache ownership checks passed/);
});

test('Git guard rejects unsupported scoped trust and missing ownership enforcement', {
	skip: !builderImage && 'Set BUILDER_GIT_TEST_IMAGE to exercise a prepared local image'
}, t => {
	const directory = temporary(t);
	const cases = [
		{
			body: 'if [[ "$1" == -c ]]; then echo "fixture: command-scoped trust unsupported" >&2; return 128; fi'
			, error: /does not support command-scoped safe.directory/
		}
		, {
			body: 'if [[ "$1" == -C ]]; then echo true; return 0; fi'
			, error: /did not reject a foreign-owned cache/
		}
		, {
			body: 'if [[ "$1" == -C ]]; then echo "fixture: unrelated failure" >&2; return 128; fi'
			, error: /failed for a reason other than cache ownership/
		}
	];
	for(const [index, { body, error }] of cases.entries())
	{
		const filename = path.join(directory, `guard-${index}.sh`);
		const injected = `git() {\n${body}\ncommand git "$@"\n}\ngit --version`;
		assert.ok(guard.includes('\ngit --version\n'));
		fs.writeFileSync(filename, guard.replace('\ngit --version\n', `\n${injected}\n`));
		const result = spawnSync('bash', [filename, builderImage], { encoding: 'utf8', timeout: 60000 });
		assert.equal(result.status, 1, result.stdout + result.stderr);
		assert.match(result.stderr, error);
		assert.doesNotMatch(result.stdout, /Builder Git cache ownership checks passed/);
	}
});
