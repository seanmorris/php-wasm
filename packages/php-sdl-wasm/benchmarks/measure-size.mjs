import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';

// Build each artifact directory with Make first; this command only measures it.
const [baselineRecord, baselineDirectory, candidateDirectory, output, change] = process.argv.slice(2);
assert.ok(change, 'Usage: node measure-size.mjs baseline.json baseline-dir candidate-dir output.json "change description"');

const prior = JSON.parse(await readFile(baselineRecord, 'utf8'));
const names = Object.keys(prior.sizes);
const baseline = {};
const candidate = {};

/**
 * Identify bytes without relying on a generated filename or modification time.
 * @param {Buffer} bytes Artifact bytes.
 * @returns {string} SHA-256 digest.
 */
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Compress a complete artifact with the same settings on both sides.
 * @param {Buffer} bytes Artifact bytes.
 * @returns {object} Lengths and content identity.
 */
const measure = bytes => ({
	raw: bytes.length
	, gzip: gzipSync(bytes, {level: 9}).length
	, brotli: brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 11}}).length
	, sha256: hash(bytes)
});

for(const name of names)
{
	const before = await readFile(join(baselineDirectory, name));
	assert.equal(hash(before), prior.sizes[name].sha256, `Unexpected baseline: ${name}`);
	baseline[name] = measure(before);
	candidate[name] = measure(await readFile(join(candidateDirectory, name)));
}

const icu = await readFile(join(candidateDirectory, 'php.data'));
const unchangedIcu = {raw: icu.length, sha256: hash(icu)};
assert.equal(unchangedIcu.sha256, prior.unchangedIcu.sha256, 'ICU changed; include it in the comparison');

const totals = Object.fromEntries(['raw', 'gzip', 'brotli'].map(encoding => {
	const before = names.reduce((sum, name) => sum + baseline[name][encoding], 0);
	const after = names.reduce((sum, name) => sum + candidate[name][encoding], 0);
	return [encoding, {before, after, increase: after - before, percent: (after - before) * 100 / before}];
}));

await writeFile(output, JSON.stringify({
	date: new Date().toISOString().slice(0, 10)
	, baseCommit: prior.baseCommit
	, baselineRecord, change
	, phpVersion: prior.phpVersion, emscriptenVersion: prior.emscriptenVersion
	, profile: prior.profile, build: prior.build
	, compression: {
		node: process.version, zlib: process.versions.zlib, gzipLevel: 9, brotliQuality: 11
		, note: 'Both artifacts recompressed with the same tool/version.'
	}
	, baseline, sizes: candidate, unchangedIcu, totals
}, null, 2) + '\n');
console.log(JSON.stringify(totals, null, 2));
