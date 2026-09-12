#!/usr/bin/env node
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { verifyCloudflare } from './package-cloudflare.mjs';

export const PROJECT = 'php-wasm-nightly';
export const PRODUCTION_URL = 'https://nightly.php-wasm.seanmorr.is';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_VERSION = '4.131.1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const filePattern = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const maxResponseBytes = 64 * 1024 * 1024;
const diagnosticNames = ['release-preview.json', 'release-production.json', 'release-result.json'];
const requireCondition = (condition, message) => { if(!condition) throw new Error(message); };
const safePath = name => typeof name === 'string' && filePattern.test(name)
	&& name.split('/').every(part => !['.', '..'].includes(part) && !part.startsWith('.env') && !part.startsWith('.dev.vars') && !['.npmrc', '.git', '.ssh'].includes(part));

/**
 * Raw HTTPS responses deliberately retain compressed bytes for digest checks.
 * @param {string|URL} url HTTPS endpoint.
 * @param {object} options Request method, headers and abort signal.
 * @param {object} dependencies Optional HTTPS adapter for isolated tests.
 * @returns {Promise<Response>} Response with original encoded body bytes.
 */
export function rawFetch(url, {method = 'GET', headers = {}, signal} = {}, dependencies = {})
{
	return new Promise((resolve, reject) => {
		const request = (dependencies.request ?? https.request)(url, {method, headers, signal}, response => {
			const chunks = [];
			let bytes = 0;
			response.on('data', chunk => {
				bytes += chunk.length;
				if(bytes > maxResponseBytes) request.destroy(new Error('HTTP response exceeded the release size limit'));
				else chunks.push(chunk);
			});
			response.on('error', reject);
			response.on('end', () => {
				const body = method === 'HEAD' || [204, 205, 304].includes(response.statusCode) ? null : Buffer.concat(chunks);
				try { resolve(new Response(body, {status: response.statusCode, headers: response.headers})); }
				catch(error) { reject(error); }
			});
		});
		request.on('error', reject);
		request.end();
	});
}

async function inventory(root, relative = '')
{
	const files = [];
	for(const entry of (await fs.readdir(path.join(root, relative))).sort())
	{
		// Only these exact root names are non-deployed metadata. Never exclude
		// similarly named files inside dist, or follow links into outside state.
		if(!relative && ['stage.manifest.json', '.wrangler', ...diagnosticNames].includes(entry))
		{
			const stat = await fs.lstat(path.join(root, entry));
			requireCondition(entry === '.wrangler' ? stat.isDirectory() : stat.isFile(), 'Non-regular stage metadata');
			continue;
		}
		const name = relative ? `${relative}/${entry}` : entry;
		requireCondition(safePath(name), 'Unsafe staged filename');
		const stat = await fs.lstat(path.join(root, name));
		if(stat.isDirectory()) files.push(...await inventory(root, name));
		else
		{
			requireCondition(stat.isFile(), `Non-regular staged file: ${name}`);
			files.push(name);
		}
	}
	return files.sort();
}

/**
 * Verify every deployed byte and its relationship to the final PHP artifact.
 * @param {object} options Staged project, final artifact and release identity.
 * @returns {Promise<object>} Verified stage inventory and immutable fingerprint.
 */
export async function verifyReleaseStage({projectDir, artifactRoot, buildId, phpVersion = '8.5'})
{
	requireCondition(typeof buildId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(buildId), 'Invalid build ID');
	requireCondition(phpVersion === '8.5', 'The nightly PHP demo requires PHP 8.5');
	requireCondition(typeof projectDir === 'string' && typeof artifactRoot === 'string', 'projectDir and artifactRoot are required');
	projectDir = path.resolve(projectDir);
	artifactRoot = path.resolve(artifactRoot);
	requireCondition((await fs.lstat(projectDir)).isDirectory(), 'Staged project must be a regular directory');
	const manifestPath = path.join(projectDir, 'stage.manifest.json');
	requireCondition((await fs.lstat(manifestPath)).isFile(), 'Stage manifest must be a regular file');
	const manifestBytes = await fs.readFile(manifestPath);
	const stage = JSON.parse(manifestBytes);
	requireCondition(stage.schema === 1 && stage.buildId === buildId && stage.phpVersion === phpVersion, 'Stage identity mismatch');
	requireCondition(Array.isArray(stage.files) && stage.files.length > 0 && stage.files.length <= 128, 'Invalid stage file inventory');
	const names = new Set();
	for(const file of stage.files)
	{
		requireCondition(safePath(file.path) && !names.has(file.path) && file.path !== 'stage.manifest.json' && !diagnosticNames.includes(file.path) && !file.path.startsWith('.wrangler/'), 'Invalid or duplicate stage path');
		requireCondition(/^[a-f0-9]{64}$/.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes >= 0, 'Invalid stage digest or size');
		names.add(file.path);
	}
	requireCondition(names.has('wrangler.toml') && names.has('dist/_worker.js/index.js'), 'Missing Pages configuration or worker entrypoint');
	requireCondition(JSON.stringify(await inventory(projectDir)) === JSON.stringify([...names].sort()), 'Stage inventory does not match the directory');
	for(const file of stage.files)
	{
		const bytes = await fs.readFile(path.join(projectDir, file.path));
		requireCondition(bytes.length === file.bytes && sha256(bytes) === file.sha256, `Staged bytes changed: ${file.path}`);
	}
	const {manifest, manifestName} = await verifyCloudflare(artifactRoot, phpVersion);
	requireCondition(stage.phpManifestSha256 === sha256(await fs.readFile(path.join(artifactRoot, manifestName))), 'Stage references a different PHP artifact manifest');
	const rawFiles = manifest.files.filter(file => /\.(mjs|wasm)$/.test(file.path));
	for(const file of rawFiles)
	{
		const staged = stage.files.find(candidate => candidate.path === `dist/_worker.js/php-cloud-wasm/${file.path}`);
		requireCondition(staged?.sha256 === file.sha256 && staged?.bytes === file.bytes, 'Staged PHP module differs from the final artifact');
	}
	requireCondition(Array.isArray(stage.assets) && stage.assets.length === rawFiles.length, 'Static smoke inventory must include every raw PHP JS/Wasm asset');
	const assets = new Set();
	for(const asset of stage.assets)
	{
		const prefix = `/${buildId}/php-cloud-wasm/`;
		requireCondition(typeof asset.path === 'string' && asset.path.startsWith(prefix), 'Static asset is outside the immutable build prefix');
		const name = asset.path.slice(prefix.length);
		const original = rawFiles.find(file => file.path === name);
		requireCondition(original && !assets.has(name) && original.sha256 === asset.sha256 && original.bytes === asset.bytes, 'Static asset identity mismatch');
		assets.add(name);
		for(const [encoding, metadata] of Object.entries(asset.encodings ?? {}))
		{
			requireCondition(['br', 'gzip'].includes(encoding), 'Unsupported static content encoding');
			const sidecar = path.join(artifactRoot, name + (encoding === 'br' ? '.br' : '.gz'));
			requireCondition((await fs.lstat(sidecar)).isFile(), 'Compressed artifact must be a regular file');
			const bytes = await fs.readFile(sidecar);
			requireCondition(bytes.length === metadata.bytes && sha256(bytes) === metadata.sha256, 'Compressed artifact identity mismatch');
			const decoded = encoding === 'br' ? brotliDecompressSync(bytes, {maxOutputLength: maxResponseBytes}) : gunzipSync(bytes, {maxOutputLength: maxResponseBytes});
			requireCondition(decoded.length === asset.bytes && sha256(decoded) === asset.sha256, 'Compressed artifact does not decode to the original');
		}
		if(name === manifest.runtime || name.endsWith('.wasm'))
			requireCondition(asset.encodings?.br && asset.encodings?.gzip, 'Runtime JS and Wasm require Brotli and gzip smoke coverage');
	}
	return {stage, fingerprint: sha256(manifestBytes), projectDir, artifactRoot};
}

/**
 * Run the pinned executable, reading structured output instead of scraping logs.
 * @param {object} options CLI arguments, working directory, environment and timeout.
 * @param {object} dependencies Optional process and metadata adapters for unit tests.
 * @returns {Promise<object>} Validated structured Pages deployment output.
 */
export async function runWrangler({args, cwd, env, timeoutMs}, dependencies = {})
{
	const metadata = JSON.parse(await (dependencies.readMetadata ?? fs.readFile)(path.join(repoRoot, 'node_modules/wrangler/package.json'), 'utf8'));
	requireCondition(metadata.version === WRANGLER_VERSION, `Wrangler ${WRANGLER_VERSION} is required`);
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'php-nightly-wrangler-'));
	const output = path.join(temporary, 'result.ndjson');
	try
	{
		await new Promise((resolve, reject) => {
			const child = (dependencies.spawn ?? spawn)(process.execPath, [path.join(repoRoot, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
				cwd, env: {...env, WRANGLER_OUTPUT_FILE_PATH: output, WRANGLER_CACHE_DIR: path.join(temporary, 'cache')}, stdio: ['ignore', 'ignore', 'ignore'], timeout: timeoutMs, killSignal: 'SIGKILL'
			});
			child.once('error', () => reject(new Error('Unable to execute pinned Wrangler')));
			child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(signal ? 'Wrangler deployment timed out or was terminated' : `Wrangler deployment failed (exit ${code})`)));
		});
		const records = (await fs.readFile(output, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
		const deployments = records.filter(record => record.type === 'pages-deploy' && record.version === 1);
		requireCondition(deployments.length === 1, 'Wrangler did not report exactly one Pages deployment');
		const result = deployments[0];
		return {deploymentId: result.deployment_id, url: result.url, project: result.pages_project};
	}
	finally { await fs.rm(temporary, {recursive: true, force: true}); }
}

/**
 * Preview, verify, promote the exact same stage, and restore prior production on failure.
 * @param {object} options Explicit staged project, artifact root and build identity.
 * @param {object} dependencies Optional environment, network, process, clock and log adapters.
 * @returns {Promise<object>} Verified deployment IDs and unchanged stage fingerprint.
 */
export async function deployCloudflareNightly(options, dependencies = {})
{
	const environment = dependencies.env ?? process.env;
	const token = environment.CLOUDFLARE_API_TOKEN;
	const account = environment.CLOUDFLARE_ACCOUNT_ID;
	requireCondition(typeof token === 'string' && token.trim(), 'CLOUDFLARE_API_TOKEN is required');
	requireCondition(typeof account === 'string' && /^[a-f0-9]{32}$/.test(account), 'CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID');
	requireCondition(options.project === undefined || options.project === PROJECT, `Only the ${PROJECT} Pages project is supported`);
	const now = dependencies.now ?? Date.now;
	const sleep = dependencies.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
	const fetch = dependencies.fetch ?? rawFetch;
	const runner = dependencies.runWrangler ?? runWrangler;
	const reporter = dependencies.report ?? (message => console.log(message));
	const report = message => reporter(String(message).replaceAll(token, '[redacted]'));
	const timeoutMs = dependencies.timeoutMs ?? 120_000;
	const intervalMs = dependencies.intervalMs ?? 2_000;
	requireCondition(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 600_000 && Number.isSafeInteger(intervalMs) && intervalMs > 0 && intervalMs <= timeoutMs, 'Invalid bounded polling settings');
	const verified = await verifyReleaseStage(options);
	const {stage, projectDir, fingerprint} = verified;
	const diagnose = async (name, details) => {
		const handle = await fs.open(path.join(projectDir, name), constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
		try { await handle.writeFile(JSON.stringify({schema: 1, buildId: stage.buildId, fingerprint, ...details}, null, 2).replaceAll(token, '[redacted]') + '\n'); }
		finally { await handle.close(); }
	};
	const releaseTag = `php-cloud-wasm ${stage.buildId} ${fingerprint} ${randomUUID()}`;
	const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${PROJECT}`;
	const request = async (url, init, deadline = now() + timeoutMs) => {
		const controller = new AbortController();
		const limit = Math.max(1, Math.min(15_000, deadline - now()));
		let timer;
		try
		{
			return await Promise.race([
				fetch(url, {...init, signal: controller.signal, redirect: 'error'})
				, new Promise((resolve, reject) => timer = setTimeout(() => { controller.abort(); reject(new Error('Release HTTP request timed out')); }, limit))
			]);
		}
		catch { throw new Error('Release HTTP request failed'); }
		finally { clearTimeout(timer); }
	};
	const api = async (suffix = '', method = 'GET', deadline) => {
		const response = await request(apiRoot + suffix, {method, headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}}, deadline);
		requireCondition(response.status === 200, `Pages API request failed (HTTP ${response.status})`);
		let body;
		try { body = await response.json(); } catch { throw new Error('Malformed Pages API response'); }
		requireCondition(body.success === true && body.result, 'Pages API reported failure');
		return body.result;
	};
	const retry = async (operation, label) => {
		const deadline = now() + timeoutMs;
		let failure;
		for(let attempt = 0; attempt <= Math.ceil(timeoutMs / intervalMs) && now() < deadline; attempt++)
		{
			try { return await operation(deadline); }
			catch(error) { failure = error; }
			await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
		}
		throw new Error(`${label} failed within the bounded verification window: ${failure?.message ?? 'timeout'}`);
	};
	const checkDeployment = async (deployment, branch) => retry(async deadline => {
		const current = await api(`/deployments/${deployment.deploymentId}`, 'GET', deadline);
		requireCondition(current.id === deployment.deploymentId && current.project_name === PROJECT && current.environment === (branch === 'main' ? 'production' : 'preview') && current.deployment_trigger?.metadata?.branch === branch, 'Pages deployment identity mismatch');
		requireCondition(current.latest_stage?.name === 'deploy' && current.latest_stage.status === 'success', 'Pages deployment is not successful yet');
		return current;
	}, 'Deployment readiness');
	const smoke = async base => retry(async deadline => {
		for(const route of ['/php/health', '/php/d1'])
		{
			const response = await request(new URL(route, base), {headers: {'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache'}}, deadline);
			requireCondition(response.status === 200 && response.headers.get('content-type')?.includes('application/json'), `PHP/D1 smoke failed at ${route}`);
			let health;
			try { health = await response.json(); } catch { throw new Error('Malformed PHP/D1 health response'); }
			requireCondition(health.ok === true && health.buildId === stage.buildId && health.phpVersion === '8.5' && /^8\.5\.\d+[A-Za-z0-9.-]*$/.test(health.phpFullVersion)
				&& health.sapi === 'embed' && health.driver === 'cfd1' && health.d1?.answer === 42, 'PHP/D1 health identity or result mismatch');
		}
		for(const route of ['/php/', '/php/phpinfo'])
		{
			const response = await request(new URL(route, base), {headers: {'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache'}}, deadline);
			requireCondition(response.status === 200 && response.headers.get('content-type')?.includes('text/html'), `PHP HTML smoke failed at ${route}`);
			const html = await response.text();
			requireCondition(/8\.5\.\d+/.test(html), `PHP version is missing at ${route}`);
			if(route === '/php/') requireCondition(html.includes('PHP on Cloudflare') && html.includes(`/${stage.buildId}/php-cloud-wasm/`), 'PHP home page identity mismatch');
			else requireCondition(/PHP Version/i.test(html) && /cfd1/i.test(html), 'PHP information page is missing PHP or the D1 driver');
		}
		for(const asset of stage.assets)
		{
			for(const [encoding, expected] of [['identity', asset], ...Object.entries(asset.encodings ?? {})])
			{
				requireCondition(now() < deadline, 'Static smoke verification deadline exceeded');
				const response = await request(new URL(asset.path, base), {headers: {'Accept-Encoding': encoding, 'Cache-Control': 'no-cache'}}, deadline);
				requireCondition(response.status === 200, `Static asset HTTP failure: ${asset.path}`);
				requireCondition((response.headers.get('content-encoding') ?? 'identity').toLowerCase() === encoding, `Incorrect content encoding: ${asset.path}`);
				if(Object.keys(asset.encodings ?? {}).length) requireCondition(response.headers.get('vary')?.toLowerCase().split(/\s*,\s*/).includes('accept-encoding'), 'Static response lacks Vary: Accept-Encoding');
				const contentType = response.headers.get('content-type')?.split(';')[0].trim();
				requireCondition(asset.path.endsWith('.wasm') ? contentType === 'application/wasm' : ['application/javascript', 'text/javascript'].includes(contentType), 'Incorrect static content type');
				const bytes = Buffer.from(await response.arrayBuffer());
				requireCondition(bytes.length === expected.bytes && sha256(bytes) === expected.sha256, `Served ${encoding} digest mismatch: ${asset.path}`);
				const decoded = encoding === 'br' ? brotliDecompressSync(bytes, {maxOutputLength: maxResponseBytes}) : encoding === 'gzip' ? gunzipSync(bytes, {maxOutputLength: maxResponseBytes}) : bytes;
				requireCondition(decoded.length === asset.bytes && sha256(decoded) === asset.sha256, 'Served encoding does not match original artifact');
			}
		}
	}, 'PHP/D1 and static smoke');
	const unchanged = async () => requireCondition((await verifyReleaseStage(options)).fingerprint === fingerprint, 'Staged release changed after preview');
	let previous, preview, production;
	let productionAttempted = false;
	let rollback = 'not-needed';
	const execute = async branch => {
		await unchanged();
		let result;
		if(branch === 'main') productionAttempted = true;
		try { result = await runner({
			args: ['pages', 'deploy', path.join(projectDir, 'dist'), '--project-name', PROJECT, '--branch', branch, '--no-bundle', '--commit-message', releaseTag, '--commit-dirty=true', '--env-file', '/dev/null', '--experimental-provision=false', '--experimental-auto-create=false']
			, cwd: projectDir
			// Do not inherit Wrangler/API overrides, dotenv options or unrelated
			// workflow secrets into the deployment subprocess.
			, env: {...Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'USERPROFILE'].filter(name => environment[name] !== undefined).map(name => [name, environment[name]])), CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_SEND_ERROR_REPORTS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false'}
			, timeoutMs: 300_000
		}); }
		catch { throw new Error('Wrangler deployment did not complete successfully'); }
		requireCondition(result.project === PROJECT && idPattern.test(result.deploymentId), 'Unexpected Wrangler deployment identity');
		// Capture the acknowledged upload before polling. A pending deployment
		// can become production after this process stops waiting for readiness.
		if(branch === 'main') production = result;
		const url = new URL(result.url);
		requireCondition(url.protocol === 'https:' && /^[a-z0-9-]+\.php-wasm-nightly\.pages\.dev$/.test(url.hostname) && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash, 'Unexpected Pages deployment URL');
		await diagnose(branch === 'main' ? 'release-production.json' : 'release-preview.json', {...result, branch, verified: false});
		await checkDeployment(result, branch);
		return result;
	};
	try
	{
		const project = await api();
		requireCondition(project.name === PROJECT && project.production_branch === 'main', 'Pages project must use the main production branch');
		previous = project.canonical_deployment;
		requireCondition(previous && idPattern.test(previous.id) && previous.environment === 'production' && previous.latest_stage?.status === 'success', 'A successful prior production deployment is required for rollback');
		report(`Verifying preview for build ${stage.buildId}`);
		preview = await execute(`verify-${sha256(Buffer.from(releaseTag)).slice(0, 20)}`);
		await smoke(preview.url);
		await diagnose('release-preview.json', {...preview, verified: true});
		await unchanged();
		requireCondition((await api()).canonical_deployment?.id === previous.id, 'Production changed during preview; refusing promotion');
		report(`Preview verified; promoting unchanged build ${stage.buildId} to main`);
		try
		{
			production = await execute('main');
			await smoke(production.url);
			await smoke(PRODUCTION_URL);
			await unchanged();
			requireCondition((await api()).canonical_deployment?.id === production.deploymentId, 'Production deployment changed during verification');
			await diagnose('release-production.json', {...production, branch: 'main', verified: true});
			const result = {buildId: stage.buildId, fingerprint, previewDeploymentId: preview.deploymentId, productionDeploymentId: production.deploymentId, previousDeploymentId: previous.id, productionUrl: PRODUCTION_URL};
			await diagnose('release-result.json', {status: 'success', ...result});
			report(`Production verified for build ${stage.buildId}`);
			return result;
		}
		catch(error)
		{
			try
			{
				const current = (await api()).canonical_deployment;
				if(current?.id !== previous.id)
				{
					requireCondition(current?.id === production?.deploymentId || current?.deployment_trigger?.metadata?.commit_message === releaseTag, 'Another release owns production; automatic rollback refused');
					// https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/
					await api(`/deployments/${previous.id}/rollback`, 'POST');
					await retry(async deadline => requireCondition((await api('', 'GET', deadline)).canonical_deployment?.id === previous.id, 'Prior production is not restored yet'), 'Production rollback');
					rollback = 'restored';
					report(`Restored prior production deployment ${previous.id}`);
				}
				else if(productionAttempted)
				{
					// Seeing the previous canonical ID does not cancel an accepted
					// upload. Unless the new deployment is terminally failed, it
					// may still become live and needs explicit operator recovery.
					const pending = production && await api(`/deployments/${production.deploymentId}`);
					requireCondition(pending?.id === production?.deploymentId && pending?.latest_stage?.status === 'failure', 'Production upload may still become live');
				}
			}
			catch { rollback = 'unconfirmed'; throw new Error('Production verification failed and rollback could not be confirmed; manual intervention is required'); }
			throw new Error(`Production release failed; prior production retained or restored: ${String(error.message).replaceAll(token, '[redacted]')}`);
		}
	}
	catch(error)
	{
		// Diagnostics must never prevent a required rollback or hide its outcome.
		await diagnose('release-result.json', {status: 'failed', rollback, previousDeploymentId: previous?.id, previewDeploymentId: preview?.deploymentId, productionDeploymentId: production?.deploymentId, error: String(error.message)}).catch(() => {});
		throw error;
	}
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const options = {};
	const flags = {'--project-dir': 'projectDir', '--artifact-root': 'artifactRoot', '--build-id': 'buildId', '--php-version': 'phpVersion'};
	try
	{
		const args = process.argv.slice(2);
		while(args.length)
		{
			const flag = args.shift();
			requireCondition(Object.hasOwn(flags, flag) && args.length && !args[0].startsWith('--') && !Object.hasOwn(options, flags[flag]), 'Unknown, repeated or incomplete release option');
			options[flags[flag]] = args.shift();
		}
		const result = await deployCloudflareNightly(options);
		console.log(JSON.stringify(result));
	}
	catch(error)
	{
		const token = process.env.CLOUDFLARE_API_TOKEN;
		console.error(token ? String(error.message).replaceAll(token, '[redacted]') : error.message);
		process.exitCode = 1;
	}
}
