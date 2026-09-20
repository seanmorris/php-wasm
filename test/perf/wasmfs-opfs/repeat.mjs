import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {frameworks} from './frameworks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.resolve(root, process.env.BENCH_OUTPUT_DIR ?? '.cache/wasmfs-opfs/clean-repeat');
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
const samples = Number(process.env.BENCH_SAMPLES ?? 20);
const minimumIdlePercent = Number(process.env.BENCH_MIN_IDLE_PERCENT ?? 90);
const resume = process.env.BENCH_RESUME === '1';
if(!Number.isFinite(minimumIdlePercent) || minimumIdlePercent < 0 || minimumIdlePercent > 100) throw new Error('BENCH_MIN_IDLE_PERCENT must be between 0 and 100');
const inputs = JSON.parse(await fs.readFile(path.join(root, '.cache/wasmfs-opfs/build-inputs.json'), 'utf8'));
const hashes = new Map();
await fs.mkdir(output, {recursive: true});

/**
 * Hashes fixed inputs once when checking whether a retained trial can be reused.
 * @param {string} filename Absolute input path.
 * @returns {Promise<string>} SHA-256 of the current bytes.
 */
async function hash(filename)
{
	if(!hashes.has(filename)) hashes.set(filename, createHash('sha256').update(await fs.readFile(filename)).digest('hex'));
	return hashes.get(filename);
}

/**
 * Resumes only complete trials with identical inputs and sample counts.
 * @param {string} backend Filesystem variant.
 * @param {object} framework Demo metadata.
 * @param {number} round Fresh-profile round.
 * @returns {Promise<boolean>} Whether the existing trial is already complete.
 */
async function completed(backend, framework, round)
{
	const filename = path.join(output, `${backend}-${framework.id}-${round}.json`);
	let trial;
	try
	{ trial = JSON.parse(await fs.readFile(filename, 'utf8')); }
	catch(error)
	{ if(error.code === 'ENOENT') return false; throw error; }
	if(!resume) throw new Error(`Existing trial: ${filename}; use a new output directory or BENCH_RESUME=1`);
	if(!trial.complete)
	{
		await fs.rename(filename, `${filename}.incomplete-${Date.now()}`);
		return false;
	}
	let matches = trial.backend === backend && trial.framework === framework.id && trial.round === round
		&& trial.sourceCommit === inputs.sourceCommit && trial.phpVersion === inputs.phpVersion && trial.samples.length === samples && trial.binaries.length === 3;
	matches &&= trial.archive.sha256 === await hash(path.join(root, 'demo-web/public/backups', framework.archive));
	for(const binary of trial.binaries)
	{
		matches &&= binary.sha256 === await hash(path.join(root, '.cache/wasmfs-opfs/artifacts', backend, 'packages/php-cgi-wasm', binary.name));
	}
	if(!matches) throw new Error(`Retained trial has different inputs: ${filename}; use a new output directory`);
	console.log(JSON.stringify({event: 'retained', backend, framework: framework.id, round}));
	return true;
}

/**
 * Samples host CPU counters before starting a timed trial.
 * @returns {Promise<object>} Idle percentage and running-container evidence.
 */
async function idleSample()
{
	const before = os.cpus().map(cpu => cpu.times);
	await new Promise(resolve => setTimeout(resolve, 3000));
	const after = os.cpus().map(cpu => cpu.times);
	let total = 0, idle = 0;
	for(let index = 0; index < before.length; index++)
	{
		for(const key of Object.keys(before[index])) total += after[index][key] - before[index][key];
		idle += after[index].idle - before[index].idle;
	}
	const containers = execFileSync('docker', ['ps', '--format', '{{.Names}}'], {encoding: 'utf8'}).trim().split('\n');
	return {time: new Date().toISOString(), idlePercent: 100 * idle / total, loadAverage: os.loadavg(), containers};
}

for(const framework of frameworks)
{
	for(let round = 0; round < rounds; round++)
	{
		for(const backend of round % 2 ? ['opfs', 'idbfs'] : ['idbfs', 'opfs'])
		{
			if(await completed(backend, framework, round)) continue;
			let ready = false;
			let preflight;
			for(let attempt = 0; attempt < 100; attempt++)
			{
				const evidence = {...await idleSample(), backend, framework: framework.id, round, minimumIdlePercent};
				await fs.appendFile(path.join(output, 'host-idle.jsonl'), JSON.stringify(evidence) + '\n');
				ready = evidence.idlePercent >= minimumIdlePercent && !evidence.containers.some(name => /emscripten-builder|buildkit|buildx/.test(name));
				preflight = evidence;
				if(ready) break;
				console.log(JSON.stringify({event: 'waiting-for-idle', ...evidence}));
			}
			if(!ready) throw new Error('Host did not become idle; timed trials have not started');
			const code = await new Promise((resolve, reject) => {
				const child = spawn(process.execPath, ['test/perf/wasmfs-opfs/run.mjs', backend, framework.id], {
					cwd: root, stdio: 'inherit'
					, env: {...process.env, BENCH_OUTPUT_DIR: output, BENCH_RUN_LABEL: 'clean-repeat', BENCH_ROUNDS: '1', BENCH_FIRST_ROUND: String(round), BENCH_PREFLIGHT: JSON.stringify(preflight)}
				});
				child.on('error', reject);
				child.on('exit', resolve);
			});
			if(code !== 0) process.exitCode = 1;
		}
	}
}
