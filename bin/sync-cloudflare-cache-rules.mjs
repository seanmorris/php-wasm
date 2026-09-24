#!/usr/bin/env node
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createReleaseClient, PRODUCTION_URL} from './cloudflare-release-http.mjs';
import {validateSmokeManifest} from './verify-cloudflare-release.mjs';

export const CACHE_POLICY = JSON.parse(await fs.readFile(new URL('../.cloudflare/pages/cache-rules.json', import.meta.url), 'utf8'));
const requireCondition = (condition, message) => { if(!condition) throw new Error(message); };
const identifier = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const canonical = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
	? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');
const definition = rule => Object.fromEntries(['ref', 'description', 'expression', 'action', 'action_parameters', 'enabled'].map(key => [key, rule[key]]));

/**
 * Reconcile the two committed nightly rules without replacing the zone ruleset.
 * Purge only the release manifest's canonical URLs, including all Vary variants.
 * @param {object} options Validated release stage manifest.
 * @param {object} dependencies Optional environment, transport and report sink.
 * @returns {Promise<object>} Owned-rule snapshots, changes and purge results.
 */
export async function syncCloudflareCacheRules({stage}, dependencies = {})
{
	const environment = dependencies.env ?? process.env;
	const token = environment.CLOUDFLARE_CACHE_API_TOKEN;
	const zoneId = environment.CLOUDFLARE_ZONE_ID;
	const result = {schema: 1, buildId: stage?.buildId, hostname: CACHE_POLICY.hostname, policySha256: fingerprint(CACHE_POLICY), status: 'running', changes: [], purged: []};
	const redact = value => JSON.parse(JSON.stringify(value).replaceAll(token || '\0', '[redacted]'));
	const save = () => dependencies.saveReport?.(redact(result));
	try
	{
		validateSmokeManifest(stage);
		requireCondition(typeof token === 'string' && token.trim(), 'CLOUDFLARE_CACHE_API_TOKEN is required (zone Cache Settings Write, Cache Purge and Zone Read)');
		requireCondition(identifier(zoneId), 'CLOUDFLARE_ZONE_ID must be a 32-character zone ID');
		requireCondition(CACHE_POLICY.schema === 1 && CACHE_POLICY.hostname === new URL(PRODUCTION_URL).hostname
			&& CACHE_POLICY.phase === 'http_request_cache_settings', 'Invalid committed nightly cache policy');
		const client = createReleaseClient(dependencies);
		const root = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;
		const api = async (suffix, {method = 'GET', body, absent = false} = {}) => {
			const response = await client.request(root + suffix, {
				method, headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json'}
				, ...(body === undefined ? {} : {body: JSON.stringify(body)})
			});
			let envelope;
			try { envelope = await response.json(); }
			catch { throw new Error(`Malformed cache configuration API response (HTTP ${response.status})`); }
			requireCondition(envelope && typeof envelope === 'object', `Malformed cache configuration API response (HTTP ${response.status})`);
			if(absent && response.status === 404 && envelope.success === false) return null;
			// API messages can echo submitted expressions or credentials. Keep codes only.
			const codes = Array.isArray(envelope.errors) ? envelope.errors.map(error => error?.code).filter(Number.isSafeInteger).slice(0, 8) : [];
			requireCondition(response.ok && envelope.success === true && envelope.result,
				`Cache configuration API ${method} failed (HTTP ${response.status}${codes.length ? `; codes ${codes.join(', ')}` : ''})`);
			return envelope.result;
		};
		const zone = await api('');
		requireCondition(zone.id === zoneId && typeof zone.name === 'string'
			&& (CACHE_POLICY.hostname === zone.name || CACHE_POLICY.hostname.endsWith(`.${zone.name}`)), 'Configured zone does not contain the nightly hostname');
		const refs = CACHE_POLICY.rules.map(rule => rule.ref);
		const owned = rule => refs.includes(rule.ref);
		const validate = ruleset => {
			if(ruleset && ruleset.rules === undefined) ruleset.rules = [];
			requireCondition(ruleset && identifier(ruleset.id) && ruleset.kind === 'zone' && ruleset.phase === CACHE_POLICY.phase
				&& Array.isArray(ruleset.rules) && ruleset.rules.every(rule => identifier(rule.id)), 'Invalid cache entrypoint ruleset');
			for(const ref of refs) requireCondition(ruleset.rules.filter(rule => rule.ref === ref).length <= 1, 'Duplicate managed cache rule ref; refusing ambiguous update');
			return ruleset;
		};
		const entrypoint = `/rulesets/phases/${CACHE_POLICY.phase}/entrypoint`;
		let current = await api(entrypoint, {absent: true});
		if(current) validate(current);
		const unrelated = ruleset => (ruleset?.rules ?? []).filter(rule => !owned(rule)).map(({version, last_updated, ...rule}) => rule);
		const unchanged = fingerprint(unrelated(current));
		const snapshot = ruleset => ruleset && ({
			id: ruleset.id, version: ruleset.version, fingerprint: fingerprint(ruleset)
			, rules: ruleset.rules.flatMap((rule, index) => owned(rule) ? [{id: rule.id, position: index + 1, ...definition(rule)}] : [])
		});
		result.before = snapshot(current);
		await save();
		if(!current)
		{
			const change = {operation: 'create-ruleset', refs, status: 'attempted'};
			result.changes.push(change);
			await save();
			current = validate(await api('/rulesets', {method: 'POST', body: {
				name: 'Zone cache rules', kind: 'zone', phase: CACHE_POLICY.phase, rules: CACHE_POLICY.rules
			}}));
			change.status = 'applied';
		}
		else
		{
			const reorder = canonical(current.rules.slice(-refs.length).map(rule => rule.ref)) !== canonical(refs);
			for(const desired of CACHE_POLICY.rules)
			{
				const existing = current.rules.find(rule => rule.ref === desired.ref);
				if(existing && canonical(definition(existing)) === canonical(desired) && !reorder) continue;
				const fresh = validate(await api(entrypoint));
				requireCondition(fingerprint(fresh) === fingerprint(current), 'Cache rules changed concurrently; rerun publication to reconcile');
				const change = {ref: desired.ref, operation: existing ? 'update-rule' : 'create-rule', status: 'attempted'};
				result.changes.push(change);
				await save();
				// Individual rule operations preserve unrelated settings and their order.
				// Never retry a write with an unknown outcome; the next run resolves refs.
				current = validate(await api(`/rulesets/${current.id}/rules${existing ? `/${existing.id}` : ''}`, {
					method: existing ? 'PATCH' : 'POST'
					, body: {...desired, ...(reorder || !existing ? {position: {after: ''}} : {})}
				}));
				change.status = 'applied';
				requireCondition(fingerprint(unrelated(current)) === unchanged, 'Unrelated cache rules changed during synchronization; refusing promotion');
				result.after = snapshot(current);
				await save();
			}
		}
		const verified = validate(await api(entrypoint));
		requireCondition(verified.id === current.id && fingerprint(unrelated(verified)) === unchanged, 'Cache rules changed during readback; refusing promotion');
		requireCondition(canonical(verified.rules.slice(-refs.length).map(definition)) === canonical(CACHE_POLICY.rules), 'Managed cache rules did not match the committed policy after readback');
		result.after = snapshot(verified);
		await save();
		// A URL purge clears every Vary variant. Fresh build prefixes also make
		// retries safe without expiring any other release or hostname.
		const urls = stage.assets.map(asset => new URL(asset.path, PRODUCTION_URL).href);
		for(let index = 0; index < urls.length; index += 30)
		{
			const files = urls.slice(index, index + 30);
			await api('/purge_cache', {method: 'POST', body: {files}});
			result.purged.push(...files);
			await save();
		}
		result.status = 'success';
		await save();
		return redact(result);
	}
	catch(error)
	{
		result.status = 'failed';
		result.error = String(error.message).replaceAll(token || '\0', '[redacted]');
		await Promise.resolve().then(save).catch(() => {});
		throw Object.assign(new Error(result.error), {cacheReport: redact(result)});
	}
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	let saveReport;
	try
	{
		const args = process.argv.slice(2);
		if(args.length === 1 && args[0] === '--help')
			console.log('Usage: node bin/sync-cloudflare-cache-rules.mjs --stage-manifest FILE --report FILE');
		else
		{
			const options = {};
			const flags = {'--stage-manifest': 'manifestPath', '--report': 'reportPath'};
			while(args.length)
			{
				const flag = args.shift();
				requireCondition(Object.hasOwn(flags, flag) && args.length && !args[0].startsWith('--') && !Object.hasOwn(options, flags[flag]), 'Unknown, repeated or incomplete cache sync option');
				options[flags[flag]] = args.shift();
			}
			requireCondition(options.manifestPath && options.reportPath, '--stage-manifest and --report are required');
			saveReport = async report => {
				const handle = await fs.open(options.reportPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
				try { await handle.writeFile(JSON.stringify(report, null, 2) + '\n'); }
				finally { await handle.close(); }
			};
			let stage;
			try { stage = JSON.parse(await fs.readFile(options.manifestPath, 'utf8')); }
			catch { throw new Error('Unable to read a JSON stage manifest'); }
			const result = await syncCloudflareCacheRules({stage}, {saveReport});
			console.log(`Nightly cache policy verified; ${result.changes.length} rule changes, ${result.purged.length} release URLs purged`);
		}
	}
	catch(error)
	{
		await saveReport?.(error.cacheReport ?? {schema: 1, status: 'failed', error: error.message}).catch(() => {});
		console.error(error.message);
		process.exitCode = 1;
	}
}
