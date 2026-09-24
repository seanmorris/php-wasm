import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {CACHE_POLICY, syncCloudflareCacheRules} from '../../bin/sync-cloudflare-cache-rules.mjs';
import {PRODUCTION_URL} from '../../bin/cloudflare-release-http.mjs';

const token = 'fixture-cache-token-NOT-A-REAL-SECRET';
const zoneId = 'a'.repeat(32);
const rulesetId = 'b'.repeat(32);
const entrypoint = `/rulesets/phases/${CACHE_POLICY.phase}/entrypoint`;
const metadata = {bytes: 12, sha256: '0'.repeat(64)};
const asset = name => ({path: `/fixture-build/php-cloud-wasm/${name}`, ...metadata, encodings: {br: metadata, gzip: metadata}});
const stage = {schema: 1, buildId: 'fixture-build', phpVersion: '8.5', assets: [asset('php8.5-cloudflare-runtime.mjs'), asset('php8.5-cloudflare.wasm')]};
const unrelated = [1, 2].map(number => ({id: String(number).repeat(32), ref: `unrelated_${number}`, action: 'set_cache_settings'
	, expression: `http.host eq "unrelated-${number}.example.com"`, description: 'Private zone configuration', enabled: true, action_parameters: {cache: true}}));

/**
 * In-memory Cloudflare Rulesets API, with real individual-rule write semantics.
 * @param {object} options Initial ruleset and optional request/response faults.
 * @returns {object} Synchronizer inputs and observable API state.
 */
function fixture({missing = false, before, after} = {})
{
	const state = {ruleset: missing ? null : {id: rulesetId, kind: 'zone', phase: CACHE_POLICY.phase, version: '1', rules: structuredClone(unrelated)}, calls: [], reports: [], nextId: 3};
	const dependencies = {
		env: {CLOUDFLARE_CACHE_API_TOKEN: token, CLOUDFLARE_ZONE_ID: zoneId}
		, saveReport: report => state.reports.push(report)
		, fetch: async (input, init) => {
			const url = new URL(input);
			assert.equal(url.origin, 'https://api.cloudflare.com');
			assert.ok(url.pathname.startsWith(`/client/v4/zones/${zoneId}`));
			assert.equal(init.headers.Authorization, `Bearer ${token}`);
			assert.equal(init.redirect, 'error');
			assert.ok(init.signal instanceof AbortSignal);
			const suffix = url.pathname.slice(`/client/v4/zones/${zoneId}`.length);
			const body = init.body && JSON.parse(init.body);
			const call = {suffix, method: init.method, body};
			state.calls.push(call);
			const override = await before?.(call, state);
			if(override) return override;
			const response = result => new Response(JSON.stringify({success: true, result}), {headers: {'Content-Type': 'application/json'}});
			const add = rule => ({...structuredClone(rule), id: String(state.nextId++).padStart(32, '0'), version: '1'});
			let result;
			if(suffix === '' && init.method === 'GET') result = {id: zoneId, name: 'seanmorr.is'};
			else if(suffix === entrypoint && init.method === 'GET')
			{
				if(!state.ruleset) return new Response('{"success":false,"errors":[{"code":10003}]}', {status: 404});
				result = state.ruleset;
			}
			else if(suffix === '/rulesets' && init.method === 'POST')
			{
				assert.equal(state.ruleset, null, 'Creating an entrypoint must never replace an existing ruleset');
				result = state.ruleset = {...body, id: rulesetId, version: '1', rules: body.rules.map(add)};
			}
			else if(suffix.startsWith(`/rulesets/${rulesetId}/rules`) && ['POST', 'PATCH'].includes(init.method))
			{
				const {position, ...rule} = body;
				if(init.method === 'POST')
				{
					assert.equal(suffix, `/rulesets/${rulesetId}/rules`);
					assert.deepEqual(position, {after: ''});
					state.ruleset.rules.push(add(rule));
				}
				else
				{
					const index = state.ruleset.rules.findIndex(candidate => suffix.endsWith(`/${candidate.id}`));
					assert.notEqual(index, -1);
					const updated = {...rule, id: state.ruleset.rules[index].id, version: String(Number(state.ruleset.rules[index].version ?? 1) + 1)};
					if(position)
					{
						assert.deepEqual(position, {after: ''});
						state.ruleset.rules.splice(index, 1);
						state.ruleset.rules.push(updated);
					}
					else state.ruleset.rules[index] = updated;
				}
				state.ruleset.version = String(Number(state.ruleset.version) + 1);
				result = state.ruleset;
			}
			else if(suffix === '/purge_cache' && init.method === 'POST')
			{
				assert.deepEqual(Object.keys(body), ['files']);
				assert.ok(body.files.length > 0 && body.files.length <= 30);
				assert.ok(body.files.every(file => file.startsWith(`${PRODUCTION_URL}/fixture-build/php-cloud-wasm/`)));
				result = {id: 'c'.repeat(32)};
			}
			else assert.fail(`Unexpected mutation or endpoint: ${init.method} ${suffix}`);
			return await after?.(call, state) ?? response(result);
		}
	};
	return {state, dependencies, run: () => syncCloudflareCacheRules({stage}, dependencies)};
}

test('committed cache policy preserves negotiated downloads and excludes live PHP', () => {
	const [downloads, php] = CACHE_POLICY.rules;
	assert.equal(CACHE_POLICY.hostname, new URL(PRODUCTION_URL).hostname);
	assert.deepEqual(downloads.action_parameters, {
		cache: true, edge_ttl: {mode: 'respect_origin'}, browser_ttl: {mode: 'respect_origin'}, respect_strong_etags: true
		, vary: {default: {action: 'bypass'}, headers: {'accept-encoding': {action: 'passthrough'}}}
	});
	assert.match(downloads.expression, /not \(http.request.uri.path eq "\/php" or starts_with\(http.request.uri.path, "\/php\/"\)\)/);
	for(const rule of [downloads, php])
	{
		assert.equal(rule.action, 'set_cache_settings');
		assert.equal(rule.enabled, true);
		assert.ok(rule.expression.includes(`http.host eq "${CACHE_POLICY.hostname}"`));
		assert.doesNotMatch(rule.expression, /http.request.method/, 'Single-file purge must also match the cache rule');
	}
	for(const extension of ['js', 'mjs', 'wasm', 'so', 'dat']) assert.ok(downloads.expression.includes(`ends_with(http.request.uri.path, ".${extension}")`));
	assert.deepEqual(php.action_parameters, {cache: false});
	assert.equal(php.expression, `(http.host eq "${CACHE_POLICY.hostname}" and (http.request.uri.path eq "/php" or starts_with(http.request.uri.path, "/php/")))`);
});

test('cache sync appends only owned rules, preserves unrelated order and definitions, and purges exact release URLs', async () => {
	const current = fixture();
	const result = await current.run();
	assert.equal(result.status, 'success');
	assert.equal(result.changes.length, 2);
	assert.deepEqual(current.state.ruleset.rules.slice(0, 2), unrelated);
	assert.deepEqual(current.state.ruleset.rules.slice(2).map(({id, version, ...rule}) => rule), CACHE_POLICY.rules);
	assert.deepEqual(result.purged, stage.assets.map(file => PRODUCTION_URL + file.path));
	assert.deepEqual(result.before.rules, []);
	assert.deepEqual(result.after.rules.map(rule => rule.position), [3, 4]);
	assert.ok(!JSON.stringify(current.state.reports).includes('Private zone configuration'));
	assert.ok(!JSON.stringify(current.state.reports).includes(token));
	assert.ok(!JSON.stringify(current.state.calls).includes('purge_everything'));
	assert.ok(current.state.calls.every(call => !['PUT', 'DELETE'].includes(call.method)));
	current.state.calls.length = 0;
	// Key ordering and Cloudflare's read-only metadata must not cause drift.
	current.state.ruleset.rules = current.state.ruleset.rules.map(rule => Object.fromEntries(Object.entries({...rule, last_updated: '2026-09-24T12:00:00Z'}).reverse()));
	const second = await current.run();
	assert.deepEqual(second.changes, []);
	assert.equal(current.state.calls.filter(call => call.method !== 'GET').length, 1, 'Only this release is purged on an unchanged rerun');
});

test('cache sync creates a missing phase entrypoint and becomes idempotent', async () => {
	const current = fixture({missing: true});
	const result = await current.run();
	assert.equal(result.before, null);
	assert.deepEqual(result.changes, [{operation: 'create-ruleset', refs: CACHE_POLICY.rules.map(rule => rule.ref), status: 'applied'}]);
	assert.deepEqual((await current.run()).changes, []);
});

test('cache sync fills an existing empty ruleset when the API omits its rules array', async () => {
	const current = fixture({before: ({suffix}, state) => {
		if(suffix === entrypoint && state.ruleset.rules.length === 0)
		{
			const {rules, ...result} = state.ruleset;
			return new Response(JSON.stringify({success: true, result}));
		}
	}});
	current.state.ruleset.rules = [];
	assert.equal((await current.run()).changes.length, 2);
	assert.deepEqual((await current.run()).changes, []);
});

test('cache sync repairs definitions and moves managed rules after broad zone settings', async () => {
	const current = fixture();
	await current.run();
	const rules = current.state.ruleset.rules;
	rules[2].action_parameters.cache = false;
	rules[3].enabled = false;
	current.state.ruleset.rules = [rules[3], rules[0], rules[2], rules[1]];
	const result = await current.run();
	assert.equal(result.changes.length, 2);
	assert.deepEqual(current.state.ruleset.rules.slice(0, 2), unrelated);
	assert.deepEqual(current.state.ruleset.rules.slice(-2).map(({id, version, ...rule}) => rule), CACHE_POLICY.rules);
	assert.deepEqual((await current.run()).changes, []);
});

test('cache sync refuses duplicate managed refs and concurrent edits before writing', async () => {
	const duplicate = fixture();
	await duplicate.run();
	duplicate.state.ruleset.rules.push({...duplicate.state.ruleset.rules[2], id: 'd'.repeat(32)});
	duplicate.state.calls.length = 0;
	await assert.rejects(duplicate.run(), /Duplicate managed cache rule ref/);
	assert.ok(duplicate.state.calls.every(call => call.method === 'GET'));
	let reads = 0;
	const concurrent = fixture({before: ({suffix}, state) => {
		if(suffix === entrypoint && ++reads === 2) state.ruleset.rules[0].action_parameters.cache = false;
	}});
	await assert.rejects(concurrent.run(), /changed concurrently/);
	assert.ok(concurrent.state.calls.every(call => call.method === 'GET'));
});

test('invalid manifest, missing configuration and a wrong zone cannot mutate Cloudflare', async () => {
	for(const env of [{}, {CLOUDFLARE_CACHE_API_TOKEN: token, CLOUDFLARE_ZONE_ID: 'not-a-zone'}])
	{
		const current = fixture();
		await assert.rejects(syncCloudflareCacheRules({stage}, {...current.dependencies, env}), /CLOUDFLARE_/);
		assert.equal(current.state.calls.length, 0);
	}
	const invalid = fixture();
	await assert.rejects(syncCloudflareCacheRules({stage: {...stage, assets: [asset('../outside.mjs')]}}, invalid.dependencies), /Invalid.*asset path/);
	assert.equal(invalid.state.calls.length, 0);
	const wrong = fixture({before: ({suffix}) => suffix === '' ? new Response(JSON.stringify({success: true, result: {id: zoneId, name: 'other.example'}})) : undefined});
	await assert.rejects(wrong.run(), /zone does not contain/);
	assert.equal(wrong.state.calls.length, 1);
});

test('API errors preserve numeric codes without echoing API messages or secrets', async () => {
	const current = fixture({before: ({method}) => method === 'POST' ? new Response(JSON.stringify({success: false, errors: [{code: 10000, message: token}]}), {status: 403}) : undefined});
	await assert.rejects(current.run(), error => {
		assert.match(error.message, /HTTP 403; codes 10000/);
		assert.ok(!JSON.stringify(error.cacheReport).includes(token));
		assert.equal(error.cacheReport.changes[0].status, 'attempted');
		return true;
	});
	assert.equal(current.state.calls.filter(call => call.method === 'POST').length, 1, 'Writes are not blindly retried');
	assert.equal(current.state.calls.some(call => call.suffix === '/purge_cache'), false);
});

test('malformed API data and unsuccessful readback block purging', async () => {
	for(const body of ['null', '{broken', '{"success":false}', '{"success":true}'])
	{
		const current = fixture({before: () => new Response(body)});
		await assert.rejects(current.run(), /cache configuration API|Cache configuration API/);
		assert.equal(current.state.calls.length, 1);
	}
	const current = fixture({after: ({method}, state) => {
		if(method === 'POST' && state.ruleset.rules.length === 4) state.ruleset.rules.at(-1).enabled = false;
	}});
	await assert.rejects(current.run(), /did not match the committed policy/);
	assert.equal(current.state.calls.some(call => call.suffix === '/purge_cache'), false);
});

test('an accepted write with a lost response stops publication and a rerun reconciles by ref', async () => {
	let writes = 0;
	const current = fixture({after: ({method}) => {
		if(method === 'POST' && ++writes === 2) throw Object.assign(new Error(token), {code: 'ECONNRESET'});
	}});
	await assert.rejects(current.run(), error => {
		assert.match(error.message, /ECONNRESET/);
		assert.deepEqual(error.cacheReport.changes.map(change => change.status), ['applied', 'attempted']);
		assert.equal(error.cacheReport.status, 'failed');
		assert.ok(!error.message.includes(token));
		return true;
	});
	assert.equal(current.state.calls.some(call => call.suffix === '/purge_cache'), false);
	assert.deepEqual((await current.run()).changes, []);
	assert.equal(current.state.ruleset.rules.length, 4, 'Unknown write outcome did not create duplicate rules');
});

test('purges are bounded batches and failure retains completed batches', async () => {
	let purges = 0;
	const current = fixture({before: ({suffix}) => suffix === '/purge_cache' && ++purges === 2 ? new Response('{"success":false,"errors":[{"code":1015}]}', {status: 429}) : undefined});
	const large = {...stage, assets: [...stage.assets, ...Array.from({length: 61}, (_, index) => asset(`wrapper-${index}.mjs`))]};
	await assert.rejects(syncCloudflareCacheRules({stage: large}, current.dependencies), error => {
		assert.match(error.message, /HTTP 429; codes 1015/);
		assert.equal(error.cacheReport.purged.length, 30);
		return true;
	});
	current.state.calls.length = 0;
	assert.equal((await syncCloudflareCacheRules({stage: large}, current.dependencies)).purged.length, 63);
	assert.deepEqual(current.state.calls.filter(call => call.suffix === '/purge_cache').map(call => call.body.files.length), [30, 30, 3]);
});

test('cache sync CLI has explicit inputs and does not load deployment credentials', () => {
	const cli = args => spawnSync(process.execPath, ['bin/sync-cloudflare-cache-rules.mjs', ...args], {encoding: 'utf8', env: {PATH: process.env.PATH}});
	assert.equal(cli(['--help']).status, 0);
	for(const args of [[], ['--stage-manifest'], ['--unknown', 'file'], ['--report', 'one', '--report', 'two']])
	{
		const result = cli(args);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /required|option/);
	}
});
