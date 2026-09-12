import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = name => fs.readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const build = read('build.yaml');
const publisher = build.split(/^  index-packages:\n/m)[1]?.split(/^  [\w-]+:\n/m)[0];

test('nightly publication verifies immutable assets before promotion and notifies only on success', () => {
	assert.ok(publisher, 'Nightly publisher is required');
	const ordered = [
		'run: npm ci'
		, 'Require the dedicated nightly D1 binding'
		, 'run: npm run test:cloudflare-pages'
		, 'Download Artifact'
		, 'node bin/merge-cloudflare.mjs packages/php-cloud-wasm'
		, 'run: ./.github/bin/index-dirs.sh packages/'
		, 'node bin/stage-cloudflare-pages.mjs'
		, 'test/cloudflare-pages/runtime.integration.mjs'
		, 'uses: ryand56/r2-upload-action@'
		, 'node bin/deploy-cloudflare-nightly.mjs'
		, 'name: Notify Discord on success'
	];
	const positions = ordered.map(marker => {
		const position = publisher.indexOf(marker);
		assert.notEqual(position, -1, `Missing publication gate: ${marker}`);
		return position;
	});
	assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
	assert.match(publisher, /needs:[\s\S]*?- test-php-cloudflare/);
	assert.match(publisher, /name: Notify Discord on success\n\s+if: \$\{\{ success\(\) \}\}/);
	assert.doesNotMatch(publisher, /npm install -g wrangler|run: wrangler pages deploy/);
});

test('publishing runs are serialized and are not auto-cancelled during verification or rollback', () => {
	assert.match(build, /cancel-in-progress: \$\{\{ github.ref != 'refs\/heads\/master' && github.ref != 'refs\/heads\/develop' \}\}/);
	assert.match(publisher, /concurrency:\n\s+group: php-wasm-nightly-publication\n\s+cancel-in-progress: false/);
	assert.match(publisher, /if: github.ref == 'refs\/heads\/master' \|\| github.ref == 'refs\/heads\/develop'/);
	assert.equal(fs.existsSync(new URL('../../.github/workflows/deploy-pages-function.yaml', import.meta.url)), false,
		'The obsolete source-only deploy lane must not bypass the guarded release');
});

test('nightly staging requires an explicit D1 binding and preserves immutable build identity', () => {
	assert.match(publisher, /NIGHTLY_PHP_D1_DATABASE_ID: \$\{\{ vars.NIGHTLY_PHP_D1_DATABASE_ID \}\}/);
	assert.match(publisher, /--database-id "\$NIGHTLY_PHP_D1_DATABASE_ID"/);
	assert.match(publisher, /--php-version 8\.5/);
	assert.equal((publisher.match(/--build-id "\$STAMP-\$SHORT_SHA"/g) ?? []).length, 2);
	assert.match(publisher, /destination-dir: \$\{\{ env.STAMP \}\}-\$\{\{ env.SHORT_SHA \}\}\//);
	assert.match(publisher, /name: Preserve deployment diagnostics\n\s+if: always\(\)/);
});

test('Cloudflare build and test jobs exchange the standalone manifest-owned package', () => {
	const lane = read('cloudflare-build-step.yaml');
	const runtime = read('test-cloudflare-step.yaml');
	assert.match(lane, /node test\/cloudflare\/artifacts.mjs packages\/php-cloud-wasm "\$PHP_VERSION" > cloudflare-files.list/);
	assert.match(lane, /tar --null -T cloudflare-files.list/);
	assert.match(runtime, /CLOUDFLARE_ARTIFACT_ROOT: cloudflare-artifact\/packages\/php-cloud-wasm/);
	assert.match(runtime, /make test-cloudflare PHP_VERSION="\$PHP_VERSION"/);
	assert.match(read('test.yaml'), /run: npm run test:cloudflare-pages/);
});
