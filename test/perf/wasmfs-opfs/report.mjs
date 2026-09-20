import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {frameworks} from './frameworks.mjs';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = path.join(root, '.cache/wasmfs-opfs');
const resultsDirectory = path.resolve(root, process.env.BENCH_OUTPUT_DIR ?? '.cache/wasmfs-opfs/results');
const sizes = [];
const inputs = JSON.parse(await fs.readFile(path.join(directory, 'build-inputs.json'), 'utf8'));
const compressedByHash = new Map();
try
{
	for(const cached of JSON.parse(await fs.readFile(path.join(directory, 'artifact-sizes.json'), 'utf8')))
	{
		compressedByHash.set(cached.sha256, cached);
	}
}
catch(error)
{ if(error.code !== 'ENOENT') throw error; }

for(const backend of ['idbfs', 'opfs', 'idbfs-pruned'])
{
	const artifacts = path.join(directory, 'artifacts', backend, 'packages/php-cgi-wasm');
	let names;
	try
	{ names = await fs.readdir(artifacts); }
	catch(error)
	{ if(error.code === 'ENOENT') continue; throw error; }
	for(const name of names.filter(file => file === 'php.data' || file === `php${inputs.phpVersion}-cgi-worker.mjs` || file === `php${inputs.phpVersion}-cgi-worker.mjs.wasm`).sort())
	{
		const content = await fs.readFile(path.join(artifacts, name));
		const sha256 = createHash('sha256').update(content).digest('hex');
		let compressed = compressedByHash.get(sha256);
		if(!compressed)
		{
			console.log(`Compressing ${backend}/${name}`);
			const gzipped = await gzip(content, {level: 9});
			const brotlied = await brotli(content, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 11}});
			compressed = {rawBytes: content.length, gzip9Bytes: gzipped.length, brotli11Bytes: brotlied.length};
			compressedByHash.set(sha256, compressed);
		}
		sizes.push({...compressed, backend, name, sha256});
		await fs.writeFile(path.join(directory, 'artifact-sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
	}
}
if(process.argv.includes('--sizes-only')) process.exit();

const trials = [];
for(const name of await fs.readdir(resultsDirectory))
{
	if(/^(idbfs|opfs)-.+-\d+\.json$/.test(name)) trials.push(JSON.parse(await fs.readFile(path.join(resultsDirectory, name), 'utf8')));
}
let observations = [];
try
{ observations = (await fs.readFile(path.join(resultsDirectory, 'host-idle.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
catch(error)
{ if(error.code !== 'ENOENT') throw error; }
const preflights = trials.map(trial => trial.hostPreflight ?? observations.filter(sample =>
	sample.backend === trial.backend && sample.framework === trial.framework && sample.round === trial.round && sample.time <= trial.started
).at(-1)).filter(Boolean).map(sample => ({...sample, minimumIdlePercent: sample.minimumIdlePercent ?? 90}));

/**
 * Uses the conventional median or nearest-rank p95; raw samples remain in JSON.
 * @param {number[]} values Measurements in milliseconds.
 * @param {number} fraction Desired percentile from zero to one.
 * @returns {number|null} Percentile, or null with no valid samples.
 */
function percentile(values, fraction)
{
	values = values.filter(Number.isFinite).sort((a, b) => a - b);
	if(!values.length) return null;
	if(fraction === 0.5)
	{
		const middle = Math.floor(values.length / 2);
		return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
	}
	return values[Math.max(0, Math.ceil(values.length * fraction) - 1)];
}

const rows = [];
for(const framework of frameworks)
{
	for(const backend of ['idbfs', 'opfs'])
	{
		const matching = trials.filter(trial => trial.framework === framework.id && trial.backend === backend);
		const valid = matching.filter(trial => trial.complete);
		const samples = valid.flatMap(trial => trial.samples);
		rows.push({
			framework: framework.name
			, backend
			, completedTrials: valid.length
			, failedTrials: matching.filter(trial => trial.failure).length
			, warmSamples: samples.length
			, readyMs: percentile(valid.map(trial => trial.workerStartMs), 0.5)
			, installMs: percentile(valid.map(trial => trial.install.installMs), 0.5)
			, firstMs: percentile(valid.map(trial => trial.first.wallMs), 0.5)
			, warmMedianMs: percentile(samples.map(sample => sample.wallMs), 0.5)
			, warmP95Ms: percentile(samples.map(sample => sample.wallMs), 0.95)
			, flushMedianMs: percentile(samples.map(sample => sample.flushMs), 0.5)
			, assetMedianMs: percentile(valid.flatMap(trial => trial.assets.map(sample => sample.wallMs)), 0.5)
			, restartMs: percentile(valid.map(trial => trial.restartWorkerMs), 0.5)
			, restartMountMs: percentile(valid.map(trial => trial.restart.mountHydrateMs), 0.5)
			, restartedRequestMs: percentile(valid.map(trial => trial.afterRestart.wallMs), 0.5)
			, restartToResponseMs: percentile(valid.map(trial => trial.restartWorkerMs + trial.afterRestart.wallMs), 0.5)
			, renderMs: percentile(valid.map(trial => trial.render.wallMs), 0.5)
			, maxHeapBytes: samples.length ? Math.max(...samples.map(sample => sample.heapBytes)) : null
		});
	}
}

const numeric = value => value === null ? '—' : value.toFixed(1);
const comparisons = frameworks.map(framework => {
	const control = rows.find(row => row.framework === framework.name && row.backend === 'idbfs');
	const candidate = rows.find(row => row.framework === framework.name && row.backend === 'opfs');
	return {
		framework: framework.name
		, idbfsWarmMs: control.warmMedianMs, opfsWarmMs: candidate.warmMedianMs
		, warmChangePercent: control.warmMedianMs && candidate.warmMedianMs ? 100 * (candidate.warmMedianMs / control.warmMedianMs - 1) : null
		, idbfsRestoreMs: control.installMs, opfsRestoreMs: candidate.installMs
		, idbfsFirstMs: control.firstMs, opfsFirstMs: candidate.firstMs
		, idbfsRestartMs: control.restartMs, opfsRestartMs: candidate.restartMs
		, idbfsRestartToResponseMs: control.restartToResponseMs
		, opfsRestartToResponseMs: candidate.restartToResponseMs
	};
});
const totals = [...new Set(sizes.map(size => size.backend))].map(backend => ({
	backend, name: 'JavaScript + Wasm'
	, ...Object.fromEntries(['rawBytes', 'gzip9Bytes', 'brotli11Bytes'].map(key => [key, sizes.filter(size => size.backend === backend && !size.name.endsWith('.data')).reduce((sum, size) => sum + size[key], 0)]))
}));
const deltas = [...new Set(sizes.map(size => size.name)), 'JavaScript + Wasm'].map(name => {
	const control = [...sizes, ...totals].find(size => size.backend === 'idbfs' && size.name === name);
	const candidate = [...sizes, ...totals].find(size => size.backend === 'opfs' && size.name === name);
	return {name, ...Object.fromEntries(['rawBytes', 'gzip9Bytes', 'brotli11Bytes'].map(key => [key, control && candidate ? {bytes: candidate[key] - control[key], percent: 100 * (candidate[key] / control[key] - 1)} : null]))};
});
const difference = value => value ? `${value.bytes >= 0 ? '+' : ''}${value.bytes.toLocaleString('en-US')} (${value.percent >= 0 ? '+' : ''}${value.percent.toFixed(2)}%)` : '—';
const pruned = totals.find(total => total.backend === 'idbfs-pruned');
const opfs = totals.find(total => total.backend === 'opfs');
const combinedChange = pruned && opfs ? Object.fromEntries(['rawBytes', 'gzip9Bytes', 'brotli11Bytes'].map(key => [key, {bytes: opfs[key] - pruned[key], percent: 100 * (opfs[key] / pruned[key] - 1)}])) : null;
const lines = [
	'# CGI filesystem benchmark', ''
	, `Generated ${new Date().toISOString()}. PHP ${[...new Set(trials.map(trial => trial.install?.details.php).filter(Boolean))].join(', ')}, Emscripten 6.0.6, Chromium ${[...new Set(trials.map(trial => trial.browser))].join(', ')}.`
	, `Host: ${trials[0]?.platform.cpu ?? 'unknown'}, ${trials[0]?.platform.parallelism ?? '?'} logical CPUs, ${trials[0]?.platform.os ?? 'unknown OS'}. Fresh persistent browser profiles; warm requests bypass HTTP response caches.`
	, `Source: ${inputs.sourceCommit}. All timings are local; native compilation and compression run separately from measured trials.`
	, 'Both builds use the same static extensions and full Asyncify with a 128 KiB stack. The candidate uses the single-threaded asynchronous OPFS backend in a CGI service worker.'
	, 'The OPFS flush column is zero because its writes complete inside the CGI call. Their cost is included in response and restore timings.'
	, `Completed fresh-profile trials per framework/backend: ${[...new Set(rows.map(row => row.completedTrials))].join(', ')}. Warm requests per framework/backend: ${[...new Set(rows.map(row => row.warmSamples))].join(', ')}. Warm medians and p95 pool those requests; other timings are medians across complete trials.`
	, trials.every(trial => trial.runLabel === 'clean-repeat')
		? `The repeat driver alternates backend order between rounds and checks host CPU idle over three seconds and visible native-build containers before each trial. Idle thresholds used: ${[...new Set(preflights.map(sample => sample.minimumIdlePercent))].sort((a, b) => a - b).join('%, ')}%. Actual preflight idle range: ${numeric(Math.min(...preflights.map(sample => sample.idlePercent)))}–${numeric(Math.max(...preflights.map(sample => sample.idlePercent)))}%. This is not a guarantee of an idle host throughout each trial; observations are retained in host-idle.jsonl.`
		: 'These trials were run directly. Use repeat.mjs for alternating backend order and recorded host CPU preflight checks.'
	, 'The first response follows archive extraction into fresh storage. Warm requests reuse that worker and filesystem; persisted restart creates a new worker/runtime while retaining the browser profile.'
	, ''
	, 'Rows include only complete trials with validated framework pages and successful persisted restarts. Failed trials remain in raw JSON and do not count as fast responses.'
	, ''
	, '## Framework comparison', ''
	, '| Framework | IDBFS warm ms | OPFS warm ms | OPFS warm change | IDBFS restore s | OPFS restore s |'
	, '| --- | ---: | ---: | ---: | ---: | ---: |'
	, ...comparisons.map(row => `| ${row.framework} | ${numeric(row.idbfsWarmMs)} | ${numeric(row.opfsWarmMs)} | ${numeric(row.warmChangePercent)}% | ${numeric(row.idbfsRestoreMs === null ? null : row.idbfsRestoreMs / 1000)} | ${numeric(row.opfsRestoreMs === null ? null : row.opfsRestoreMs / 1000)} |`)
	, ''
	, 'Negative warm change means a faster OPFS response. Restore excludes archive download and includes durable writes.'
	, ''
	, '## Detailed timings'
	, ''
	, '| Framework | FS | Complete / failed | Ready ms | Restore s | First ms | Warm median ms | Warm p95 ms | Flush ms | Static ms | Restart ready ms | Restart CGI ms |'
	, '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
	, ...rows.map(row => `| ${row.framework} | ${row.backend} | ${row.completedTrials} / ${row.failedTrials} | ${numeric(row.readyMs)} | ${numeric(row.installMs === null ? null : row.installMs / 1000)} | ${numeric(row.firstMs)} | ${numeric(row.warmMedianMs)} | ${numeric(row.warmP95Ms)} | ${numeric(row.flushMedianMs)} | ${numeric(row.assetMedianMs)} | ${numeric(row.restartMs)} | ${numeric(row.restartedRequestMs)} |`)
	, '', '## Persisted restart through first response', ''
	, 'This includes both worker startup and the first framework response from retained storage. A faster worker-ready time alone does not establish a faster usable page.'
	, ''
	, '| Framework | IDBFS ms | OPFS ms |'
	, '| --- | ---: | ---: |'
	, ...comparisons.map(row => `| ${row.framework} | ${numeric(row.idbfsRestartToResponseMs)} | ${numeric(row.opfsRestartToResponseMs)} |`)
	, '', '## Artifact sizes', ''
	, '| Backend | Artifact | Raw bytes | gzip -9 bytes | Brotli -11 bytes |'
	, '| --- | --- | ---: | ---: | ---: |'
	, ...[...sizes, ...totals].map(size => `| ${size.backend} | ${size.name} | ${size.rawBytes} | ${size.gzip9Bytes} | ${size.brotli11Bytes} |`)
	, '', '## OPFS size changes', ''
	, '| Artifact | Raw change | gzip -9 change | Brotli -11 change |'
	, '| --- | ---: | ---: | ---: |'
	, ...deltas.map(delta => `| ${delta.name} | ${difference(delta.rawBytes)} | ${difference(delta.gzip9Bytes)} | ${difference(delta.brotli11Bytes)} |`)
	, ''
];
if(combinedChange)
{
	lines.push('The additional `idbfs-pruned` build uses the usual `zend_compile*,zend_add_literal*` Asyncify exclusions. It is a size reference; timing rows use the fully instrumented IDBFS control.', ''
		, '| JS + Wasm comparison | Raw change | gzip -9 change | Brotli -11 change |'
		, '| --- | ---: | ---: | ---: |'
		, `| Usual exclusions → OPFS with expanded Asyncify | ${difference(combinedChange.rawBytes)} | ${difference(combinedChange.gzip9Bytes)} | ${difference(combinedChange.brotli11Bytes)} |`, '');
}
if(trials.some(trial => trial.failure))
{
	lines.push('## Failed trials', '', ...trials.filter(trial => trial.failure).map(trial => `- ${trial.backend} / ${trial.name} / round ${trial.round}: ${trial.failure.message.split('\n')[0]}`), '');
}
await fs.writeFile(path.join(directory, 'summary.json'), JSON.stringify({sourceCommit: inputs.sourceCommit, comparisons, rows, sizes, totals, deltas, combinedChange, preflights}, null, 2) + '\n');
await fs.writeFile(path.join(directory, 'results.md'), lines.join('\n'));
const columns = Object.keys(rows[0]);
await fs.writeFile(path.join(directory, 'results.csv'), [columns.join(','), ...rows.map(row => columns.map(column => JSON.stringify(row[column] ?? '')).join(','))].join('\n') + '\n');
console.log(path.join(directory, 'results.md'));
