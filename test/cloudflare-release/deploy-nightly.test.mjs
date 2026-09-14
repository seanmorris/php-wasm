import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { deployCloudflareNightly, verifyReleaseStage, runWrangler, rawFetch, PROJECT, PRODUCTION_URL } from '../../bin/deploy-cloudflare-nightly.mjs';
import { stageCloudflarePages } from '../../bin/stage-cloudflare-pages.mjs';
import { artifactFixture, digest } from '../cloudflare-pages/fixtures.mjs';

const token = 'fixture-release-token-NOT-A-REAL-SECRET';
const account = 'a'.repeat(32);
const ids = {
	previous: '11111111-1111-4111-8111-111111111111'
	, preview: '22222222-2222-4222-8222-222222222222'
	, production: '33333333-3333-4333-8333-333333333333'
	, unrelated: '44444444-4444-4444-8444-444444444444'
};
const health = {ok: true, buildId: 'fixture-build', phpVersion: '8.5', phpFullVersion: '8.5.0', sapi: 'embed', driver: 'cfd1', d1: {answer: 42}};
const json = result => new Response(JSON.stringify(result), {headers: {'Content-Type': 'application/json'}});

/**
 * Creates a staged release and an entirely in-memory Pages/R2 service.
 * @param {import('node:test').TestContext} t Test lifetime.
 * @param {object} hooks Optional mutations of the mock service.
 * @returns {Promise<object>} Release options, injected dependencies and observed state.
 */
async function fixture(t, hooks = {})
{
	const artifact = await artifactFixture(t);
	const stage = await stageCloudflarePages(artifact.options);
	const options = {...artifact.options, projectDir: artifact.options.outputDir};
	const previous = {id: ids.previous, project_name: PROJECT, environment: 'production', latest_stage: {name: 'deploy', status: 'success'}, deployment_trigger: {metadata: {branch: 'main', commit_message: 'prior release'}}};
	const state = {canonical: previous, deployments: new Map([[previous.id, previous]]), calls: [], runs: [], reports: [], rollbacks: [], time: 0};
	const apiPrefix = `/client/v4/accounts/${account}/pages/projects/${PROJECT}`;
	const dependencies = {
		env: {CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_BASE_URL: 'https://must-not-be-used.invalid', UNRELATED_SECRET: 'must-not-be-forwarded'}
		, now: () => state.time
		, sleep: async milliseconds => state.time += milliseconds
		, timeoutMs: 200
		, intervalMs: 50
		, report: message => state.reports.push(message)
		, runWrangler: async invocation => {
			state.runs.push(invocation);
			const branch = invocation.args[invocation.args.indexOf('--branch') + 1];
			const commit = invocation.args[invocation.args.indexOf('--commit-message') + 1];
			const kind = branch === 'main' ? 'production' : 'preview';
			const deployment = {id: ids[kind], project_name: PROJECT, environment: kind, latest_stage: {name: 'deploy', status: 'success'}, deployment_trigger: {metadata: {branch, commit_message: commit}}};
			state.deployments.set(deployment.id, deployment);
			if(kind === 'production') state.canonical = deployment;
			const result = {deploymentId: deployment.id, project: PROJECT, url: `https://${kind}.php-wasm-nightly.pages.dev/`};
			await hooks.run?.({branch, kind, deployment, result, state, artifact, options});
			return result;
		}
		, fetch: async (input, init) => {
			const url = new URL(input);
			state.calls.push({url: url.href, method: init.method ?? 'GET', headers: init.headers});
			assert.equal(init.redirect, 'error');
			assert.ok(init.signal instanceof AbortSignal);
			if(url.hostname === 'api.cloudflare.com')
			{
				assert.equal(init.headers.Authorization, `Bearer ${token}`);
				assert.ok(url.pathname.startsWith(apiPrefix));
				const suffix = url.pathname.slice(apiPrefix.length);
				const overridden = await hooks.api?.({suffix, init, state, options});
				if(overridden) return overridden;
				if(!suffix) return json({success: true, result: {name: PROJECT, production_branch: 'main', canonical_deployment: state.canonical}});
				if(suffix === `/deployments/${ids.previous}/rollback`)
				{
					assert.equal(init.method, 'POST');
					state.rollbacks.push(ids.previous);
					state.canonical = previous;
					return json({success: true, result: previous});
				}
				assert.equal(init.method, 'GET');
				const deployment = state.deployments.get(suffix.slice('/deployments/'.length));
				assert.ok(deployment, `Unrecognized mock API path ${suffix}`);
				return json({success: true, result: deployment});
			}
			assert.ok(['preview.php-wasm-nightly.pages.dev', 'production.php-wasm-nightly.pages.dev', new URL(PRODUCTION_URL).hostname].includes(url.hostname));
			assert.equal(init.headers.Authorization, undefined, 'Public smoke requests never receive credentials');
			const overridden = await hooks.public?.({url, init, state, artifact, options});
			if(overridden) return overridden;
			if(['/php/health', '/php/d1'].includes(url.pathname)) return json(health);
			if(url.pathname === '/php/') return new Response('<html><title>PHP on Cloudflare</title>PHP 8.5.0 <a href="/fixture-build/php-cloud-wasm/">Downloads</a></html>', {headers: {'Content-Type': 'text/html; charset=utf-8'}});
			if(url.pathname === '/php/phpinfo') return new Response('<html>PHP Version 8.5.0 <table><tr><td>PDO drivers</td><td>cfd1</td></tr></table></html>', {headers: {'Content-Type': 'text/html'}});
			assert.ok(url.pathname.startsWith('/fixture-build/php-cloud-wasm/'));
			const encoding = init.headers['Accept-Encoding'];
			assert.ok(['identity', 'br', 'gzip'].includes(encoding));
			const filename = path.basename(url.pathname);
			const bytes = await fs.readFile(path.join(artifact.artifactRoot, filename + ({identity: '', br: '.br', gzip: '.gz'}[encoding])));
			const headers = {'Content-Type': filename.endsWith('.wasm') ? 'application/wasm' : 'application/javascript', Vary: 'Accept-Encoding'};
			if(encoding !== 'identity') headers['Content-Encoding'] = encoding;
			return new Response(bytes, {headers});
		}
	};
	return {artifact, options, stage, dependencies, state};
}

/**
 * Rewrites fixture stage metadata for a deliberately invalid input case.
 * @param {object} current Fixture.
 * @param {(manifest: object) => unknown} mutate Manifest mutation.
 * @returns {Promise<void>} Resolves after the test fixture is changed.
 */
async function changeManifest(current, mutate)
{
	const filename = path.join(current.options.projectDir, 'stage.manifest.json');
	const manifest = JSON.parse(await fs.readFile(filename, 'utf8'));
	await mutate(manifest);
	await fs.writeFile(filename, JSON.stringify(manifest));
}

test('nightly release verifies preview, promotes identical bytes to main, and checks every public route and encoding', async t => {
	const current = await fixture(t);
	const before = await verifyReleaseStage(current.options);
	const result = await deployCloudflareNightly(current.options, current.dependencies);
	assert.equal(result.productionDeploymentId, ids.production);
	assert.equal(result.previousDeploymentId, ids.previous);
	assert.equal(result.productionUrl, PRODUCTION_URL);
	assert.equal(result.fingerprint, before.fingerprint);
	assert.equal((await verifyReleaseStage(current.options)).fingerprint, before.fingerprint, 'Diagnostics do not change deployable inventory');
	assert.equal(current.state.runs.length, 2);
	assert.deepEqual(current.state.rollbacks, []);
	for(const invocation of current.state.runs)
	{
		assert.equal(invocation.cwd, current.options.projectDir);
		assert.deepEqual(invocation.args.slice(0, 5), ['pages', 'deploy', path.join(current.options.projectDir, 'dist'), '--project-name', PROJECT]);
		assert.ok(invocation.args.includes('--no-bundle'));
		assert.equal(invocation.args[invocation.args.indexOf('--env-file') + 1], '/dev/null');
		assert.ok(invocation.args.includes('--experimental-provision=false'));
		assert.ok(invocation.args.includes('--experimental-auto-create=false'));
		assert.equal(invocation.env.CLOUDFLARE_API_TOKEN, token);
		assert.equal(invocation.env.CLOUDFLARE_API_BASE_URL, undefined);
		assert.equal(invocation.env.UNRELATED_SECRET, undefined);
		assert.equal(invocation.timeoutMs, 300_000);
	}
	assert.match(current.state.runs[0].args[current.state.runs[0].args.indexOf('--branch') + 1], /^verify-[a-f0-9]{20}$/);
	assert.equal(current.state.runs[1].args[current.state.runs[1].args.indexOf('--branch') + 1], 'main');
	for(const base of ['https://preview.php-wasm-nightly.pages.dev', 'https://production.php-wasm-nightly.pages.dev', PRODUCTION_URL])
	{
		for(const route of ['/php/', '/php/phpinfo', '/php/health', '/php/d1']) assert.ok(current.state.calls.some(call => call.url === base + route));
		for(const asset of current.stage.assets)
			for(const encoding of ['identity', 'br', 'gzip']) assert.ok(current.state.calls.some(call => call.url === base + asset.path && call.headers['Accept-Encoding'] === encoding));
	}
	for(const filename of ['release-preview.json', 'release-production.json', 'release-result.json'])
	{
		const text = await fs.readFile(path.join(current.options.projectDir, filename), 'utf8');
		assert.ok(!text.includes(token));
		const record = JSON.parse(text);
		assert.equal(record.fingerprint, before.fingerprint);
		assert.equal(record.status ?? record.verified, filename === 'release-result.json' ? 'success' : true);
	}
	assert.ok(current.state.reports.every(message => !message.includes(token)));
});

test('malformed PHP/D1, home and phpinfo responses block promotion', async t => {
	const cases = [
		['wrong build', '/php/health', () => json({...health, buildId: 'stale'})]
		, ['wrong PHP', '/php/health', () => json({...health, phpFullVersion: '8.4.9'})]
		, ['wrong D1 result', '/php/d1', () => json({...health, d1: {answer: '42'}})]
		, ['malformed JSON', '/php/health', () => new Response('{', {headers: {'Content-Type': 'application/json'}})]
		, ['PHP failure', '/php/health', () => new Response('failed', {status: 502})]
		, ['broken home', '/php/', () => new Response('broken 8.5.0', {headers: {'Content-Type': 'text/html'}})]
		, ['wrong phpinfo', '/php/phpinfo', () => new Response('PHP Version 8.5.0 no driver', {headers: {'Content-Type': 'text/html'}})]
	];
	for(const [name, route, response] of cases)
	{
		await t.test(name, async nested => {
			const current = await fixture(nested, {public: ({url}) => url.pathname === route ? response() : undefined});
			await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /bounded verification window/);
			assert.equal(current.state.runs.length, 1);
			assert.equal(current.state.canonical.id, ids.previous);
			assert.deepEqual(current.state.rollbacks, []);
			assert.equal(current.state.time, current.dependencies.timeoutMs);
			const result = JSON.parse(await fs.readFile(path.join(current.options.projectDir, 'release-result.json')));
			assert.equal(result.status, 'failed');
		});
	}
});

test('served original, Brotli and gzip bytes and their negotiation headers must match', async t => {
	for(const encoding of ['identity', 'br', 'gzip'])
	{
		await t.test(encoding, async nested => {
			const current = await fixture(nested, {public: ({url, init}) => {
				if(!url.pathname.endsWith('.wasm') || init.headers['Accept-Encoding'] !== encoding) return;
				return new Response('corrupt served bytes', {headers: {'Content-Type': 'application/wasm', Vary: 'Accept-Encoding', 'Content-Encoding': encoding}});
			}});
			await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /digest mismatch/);
			assert.equal(current.state.runs.length, 1);
		});
	}
	for(const scenario of ['encoding', 'vary', 'mime'])
	{
		await t.test(scenario, async nested => {
			const current = await fixture(nested, {public: async ({url, init, artifact}) => {
				if(!url.pathname.endsWith('.wasm') || init.headers['Accept-Encoding'] !== 'br') return;
				const headers = {'Content-Type': 'application/wasm', Vary: 'Accept-Encoding', 'Content-Encoding': 'br'};
				if(scenario === 'encoding') delete headers['Content-Encoding'];
				if(scenario === 'vary') delete headers.Vary;
				if(scenario === 'mime') headers['Content-Type'] = 'text/plain';
				return new Response(await fs.readFile(path.join(artifact.artifactRoot, artifact.wasmName + '.br')), {headers});
			}});
			await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /content encoding|Vary|content type/);
			assert.equal(current.state.runs.length, 1);
		});
	}
});

test('failed production health restores the captured production ID through the Pages rollback API', async t => {
	const current = await fixture(t, {public: ({url}) => url.hostname === new URL(PRODUCTION_URL).hostname ? new Response('unhealthy', {status: 502}) : undefined});
	await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /prior production retained or restored/);
	assert.equal(current.state.runs.length, 2);
	assert.deepEqual(current.state.rollbacks, [ids.previous]);
	assert.equal(current.state.canonical.id, ids.previous);
	const result = JSON.parse(await fs.readFile(path.join(current.options.projectDir, 'release-result.json')));
	assert.equal(result.rollback, 'restored');
	assert.equal(result.previousDeploymentId, ids.previous);
	assert.equal(result.productionDeploymentId, ids.production);
});

test('a Wrangler error after promotion still restores a release owned by its unique commit message', async t => {
	const current = await fixture(t, {run: ({kind}) => { if(kind === 'production') throw new Error(token); }});
	await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), error => {
		assert.match(error.message, /prior production retained or restored/);
		assert.ok(!error.message.includes(token));
		return true;
	});
	assert.deepEqual(current.state.rollbacks, [ids.previous]);
});

test('pending or unacknowledged production uploads cannot be reported as safely retained production', async t => {
	for(const acknowledged of [true, false])
	{
		const current = await fixture(t, {run: ({kind, deployment, state}) => {
			if(kind !== 'production') return;
			state.canonical = state.deployments.get(ids.previous);
			deployment.latest_stage.status = 'active';
			if(!acknowledged) throw new Error('Connection lost after accepted upload');
		}});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /rollback could not be confirmed; manual intervention/);
		assert.equal(current.state.canonical.id, ids.previous);
		assert.deepEqual(current.state.rollbacks, []);
		const result = JSON.parse(await fs.readFile(path.join(current.options.projectDir, 'release-result.json')));
		assert.equal(result.rollback, 'unconfirmed');
		assert.equal(result.productionDeploymentId, acknowledged ? ids.production : undefined);
		assert.ok(current.state.reports.every(message => !/retained|Restored|Production verified/.test(message)));
	}
});

test('a terminal failed production deployment can confirm the prior production is retained', async t => {
	const current = await fixture(t, {run: ({kind, deployment, state}) => {
		if(kind !== 'production') return;
		state.canonical = state.deployments.get(ids.previous);
		deployment.latest_stage.status = 'failure';
	}});
	await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /prior production retained or restored/);
	assert.equal(current.state.canonical.id, ids.previous);
	assert.deepEqual(current.state.rollbacks, []);
	const result = JSON.parse(await fs.readFile(path.join(current.options.projectDir, 'release-result.json')));
	assert.equal(result.rollback, 'not-needed');
});

test('rollback errors are explicit and never reported as successful release or recovery', async t => {
	const current = await fixture(t, {
		public: ({url}) => url.hostname === 'production.php-wasm-nightly.pages.dev' ? new Response('failed', {status: 500}) : undefined
		, api: ({suffix}) => suffix.endsWith('/rollback') ? json({success: false, errors: [{message: token}]}) : undefined
	});
	await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /manual intervention is required/);
	assert.equal(current.state.canonical.id, ids.production);
	const result = JSON.parse(await fs.readFile(path.join(current.options.projectDir, 'release-result.json')));
	assert.equal(result.rollback, 'unconfirmed');
	assert.ok(!JSON.stringify(result).includes(token));
	assert.ok(current.state.reports.every(message => !message.includes('Restored')));
});

test('a concurrent production update during preview prevents promotion', async t => {
	const current = await fixture(t, {run: ({kind, state}) => {
		if(kind === 'preview') state.canonical = {...state.canonical, id: ids.unrelated};
	}});
	await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /Production changed during preview/);
	assert.equal(current.state.runs.length, 1);
	assert.deepEqual(current.state.rollbacks, []);
});

test('a different release taking production after promotion is never automatically rolled back', async t => {
	const current = await fixture(t, {public: ({url, state}) => {
		if(url.hostname === 'production.php-wasm-nightly.pages.dev')
		{
			state.canonical = {...state.canonical, id: ids.unrelated, deployment_trigger: {metadata: {commit_message: 'another release'}}};
			return new Response('other deployment', {status: 503});
		}
	}});
	await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /manual intervention/);
	assert.deepEqual(current.state.rollbacks, []);
	assert.equal(current.state.canonical.id, ids.unrelated);
});

test('changed stage bytes or refreshed stage metadata after preview prevent promotion', async t => {
	for(const updateManifest of [false, true])
	{
		const current = await fixture(t, {run: async ({kind, options}) => {
			if(kind !== 'preview') return;
			const filename = 'dist/_worker.js/index.js';
			await fs.appendFile(path.join(options.projectDir, filename), '\n// changed after preview upload\n');
			if(updateManifest)
			{
				const content = await fs.readFile(path.join(options.projectDir, filename));
				await changeManifest({options}, manifest => Object.assign(manifest.files.find(file => file.path === filename), {sha256: digest(content), bytes: content.length}));
			}
		}});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /Staged bytes changed|Staged release changed/);
		assert.equal(current.state.runs.length, 1);
		assert.deepEqual(current.state.rollbacks, []);
	}
});

test('project identity, main branch and prior successful production are mandatory before deployment', async t => {
	for(const changes of [{name: 'wrong'}, {production_branch: 'master'}, {canonical_deployment: null}, {canonical_deployment: {id: ids.previous, environment: 'production', latest_stage: {status: 'failure'}}}])
	{
		const current = await fixture(t, {api: ({suffix, state}) => !suffix ? json({success: true, result: {name: PROJECT, production_branch: 'main', canonical_deployment: state.canonical, ...changes}}) : undefined});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /main production branch|prior production/);
		assert.equal(current.state.runs.length, 0);
	}
});

test('deployment readiness polling is bounded and rejects a mismatched branch', async t => {
	for(const scenario of ['pending', 'wrong branch'])
	{
		const current = await fixture(t, {run: ({deployment}) => {
			if(scenario === 'pending') deployment.latest_stage.status = 'active';
			else deployment.deployment_trigger.metadata.branch = 'wrong';
		}});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /Deployment readiness failed within/);
		assert.equal(current.state.runs.length, 1);
		assert.equal(current.state.time, 200);
		assert.equal(current.state.calls.filter(call => call.url.endsWith(`/deployments/${ids.preview}`)).length, 4);
	}
});

test('invalid Wrangler deployment IDs, projects and URLs never receive smoke requests', async t => {
	for(const changes of [{deploymentId: '../bad'}, {project: 'wrong'}, {url: 'https://unrelated.invalid/'}, {url: 'https://preview.php-wasm-nightly.pages.dev/?extra=1'}])
	{
		const current = await fixture(t, {run: ({result}) => Object.assign(result, changes)});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /Unexpected/);
		assert.equal(current.state.calls.filter(call => !call.url.startsWith('https://api.cloudflare.com/')).length, 0);
		assert.equal(current.state.runs.length, 1);
	}
});

test('invalid credentials, release arguments and poll limits fail before requests or writes', async t => {
	const current = await fixture(t);
	const cases = [
		[{}, {env: {}}]
		, [{}, {env: {CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: 'wrong'}}]
		, [{project: 'another-project'}, {}]
		, [{phpVersion: '8.4'}, {}]
		, [{buildId: '../escape'}, {}]
		, [{projectDir: undefined}, {}]
		, [{}, {timeoutMs: 600001}]
		, [{}, {intervalMs: 0}]
	];
	for(const [options, dependencies] of cases) await assert.rejects(deployCloudflareNightly({...current.options, ...options}, {...current.dependencies, ...dependencies}));
	assert.deepEqual(current.state.calls, []);
	assert.deepEqual(current.state.runs, []);
	await assert.rejects(fs.access(path.join(current.options.projectDir, 'release-result.json')));
});

test('unsafe or altered staged and compressed artifacts fail before any network calls', async t => {
	const cases = [
		['changed worker', current => fs.appendFile(path.join(current.options.projectDir, 'dist/_worker.js/index.js'), '// changed')]
		, ['unexpected worker', current => fs.writeFile(path.join(current.options.projectDir, 'dist/extra.js'), 'extra')]
		, ['secret filename', current => fs.writeFile(path.join(current.options.projectDir, '.env.fixture'), 'FIXTURE_SECRET=do-not-read')]
		, ['duplicate', current => changeManifest(current, manifest => manifest.files.push(manifest.files[0]))]
		, ['traversal', current => changeManifest(current, manifest => manifest.files[0].path = '../escape')]
		, ['wrong PHP manifest', current => changeManifest(current, manifest => manifest.phpManifestSha256 = '0'.repeat(64))]
		, ['missing static asset', current => changeManifest(current, manifest => manifest.assets.pop())]
		, ['wrong immutable prefix', current => changeManifest(current, manifest => manifest.assets[0].path = '/other/php-cloud-wasm/wrong.mjs')]
		, ['wrong sidecar', current => fs.writeFile(path.join(current.artifact.artifactRoot, current.artifact.wasmName + '.br'), 'wrong')]
		, ['linked metadata', async current => fs.symlink('wrangler.toml', path.join(current.options.projectDir, 'release-result.json'))]
		, ['linked worker', async current => {
			const filename = path.join(current.options.projectDir, 'dist/_worker.js/index.js');
			await fs.unlink(filename);
			await fs.symlink('../../wrangler.toml', filename);
		}]
	];
	for(const [name, mutate] of cases)
	{
		await t.test(name, async nested => {
			const current = await fixture(nested);
			await mutate(current);
			await assert.rejects(deployCloudflareNightly(current.options, current.dependencies));
			assert.deepEqual(current.state.calls, []);
			assert.deepEqual(current.state.runs, []);
		});
	}
});

test('exact diagnostic names and Wrangler scratch state are outside deployment but similarly named dist files are not', async t => {
	const current = await fixture(t);
	const before = await verifyReleaseStage(current.options);
	await fs.mkdir(path.join(current.options.projectDir, '.wrangler/tmp'), {recursive: true});
	await fs.writeFile(path.join(current.options.projectDir, '.wrangler/tmp/transient'), 'Wrangler state');
	await fs.writeFile(path.join(current.options.projectDir, 'release-result.json'), '{}');
	assert.equal((await verifyReleaseStage(current.options)).fingerprint, before.fingerprint);
	await fs.writeFile(path.join(current.options.projectDir, 'dist/release-result.json'), '{}');
	await assert.rejects(verifyReleaseStage(current.options), /Stage inventory/);
});

test('API and injected runner failures do not disclose credentials', async t => {
	for(const location of ['api', 'runner'])
	{
		const current = await fixture(t, location === 'api' ? {api: () => { throw new Error(token); }} : {run: () => { throw new Error(token); }});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), error => {
			assert.ok(!error.message.includes(token));
			return true;
		});
		assert.ok(!JSON.stringify(current.state.reports).includes(token));
		assert.ok(!(await fs.readFile(path.join(current.options.projectDir, 'release-result.json'), 'utf8')).includes(token));
	}
});

test('malformed or unsuccessful Pages API envelopes fail before any deployment', async t => {
	for(const response of [
		() => new Response('unavailable', {status: 503})
		, () => new Response('{malformed')
		, () => json({success: false, result: {}})
		, () => json({success: true})
	]){
		const current = await fixture(t, {api: response});
		await assert.rejects(deployCloudflareNightly(current.options, current.dependencies), /Pages API/);
		assert.equal(current.state.runs.length, 0);
	}
});

test('release CLI rejects unknown, repeated and incomplete options without loading dotenv', () => {
	for(const args of [['--unknown', 'x'], ['--build-id', 'one', '--build-id', 'two'], ['--project-dir']])
	{
		const result = spawnSync(process.execPath, ['bin/deploy-cloudflare-nightly.mjs', ...args], {encoding: 'utf8', env: {PATH: process.env.PATH}});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Unknown, repeated or incomplete release option/);
	}
});

test('pinned Wrangler runner invokes only the local executable and consumes structured deployment metadata', async () => {
	let outputPath;
	const expected = {deploymentId: ids.preview, url: 'https://preview.php-wasm-nightly.pages.dev/', project: PROJECT};
	const result = await runWrangler({args: ['pages', 'deploy', '/fixture/dist', '--no-bundle'], cwd: '/fixture', env: {CI: 'true'}, timeoutMs: 5000}, {
		readMetadata: async filename => {
			assert.ok(filename.endsWith('/node_modules/wrangler/package.json'));
			return JSON.stringify({version: '4.131.1'});
		}
		, spawn: (command, args, options) => {
			assert.equal(command, process.execPath);
			assert.ok(args[0].endsWith('/node_modules/wrangler/bin/wrangler.js'));
			assert.deepEqual(args.slice(1), ['pages', 'deploy', '/fixture/dist', '--no-bundle']);
			assert.equal(options.cwd, '/fixture');
			assert.equal(options.timeout, 5000);
			assert.equal(options.killSignal, 'SIGKILL');
			assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore']);
			outputPath = options.env.WRANGLER_OUTPUT_FILE_PATH;
			const child = new EventEmitter;
			fs.writeFile(outputPath, JSON.stringify({type: 'pages-deploy', version: 1, deployment_id: ids.preview, url: expected.url, pages_project: PROJECT}) + '\n').then(() => child.emit('close', 0), error => child.emit('error', error));
			return child;
		}
	});
	assert.deepEqual(result, expected);
	await assert.rejects(fs.access(path.dirname(outputPath)), /ENOENT/, 'Only the runner-owned temporary output is removed');
});

test('pinned Wrangler runner refuses a different version without spawning a process', async () => {
	let called = false;
	await assert.rejects(runWrangler({}, {
		readMetadata: async () => '{"version":"4.130.0"}'
		, spawn: () => called = true
	}), /Wrangler 4\.131\.1 is required/);
	assert.equal(called, false);
});

test('raw HTTPS transport preserves encoded bytes and supports HEAD and null-body status codes', async () => {
	const bytes = Buffer.from([31, 139, 8, 0, 42]);
	for(const [method, status] of [['GET', 200], ['HEAD', 200], ['GET', 204], ['GET', 205], ['GET', 304]])
	{
		const result = await rawFetch('https://fixture.invalid/file', {method, headers: {'Accept-Encoding': 'gzip'}}, {
			request: (url, options, receive) => {
				assert.equal(url, 'https://fixture.invalid/file');
				assert.equal(options.method, method);
				const request = new EventEmitter;
				request.end = () => queueMicrotask(() => {
					const response = new EventEmitter;
					Object.assign(response, {statusCode: status, headers: {'content-encoding': 'gzip'}});
					receive(response);
					response.emit('data', bytes);
					response.emit('end');
				});
				return request;
			}
		});
		assert.equal(result.status, status);
		assert.equal(result.headers.get('content-encoding'), 'gzip');
		assert.deepEqual(Buffer.from(await result.arrayBuffer()), method === 'GET' && status === 200 ? bytes : Buffer.alloc(0));
	}
});
