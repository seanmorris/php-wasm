import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildDocsCoverageReport } from './docs/report.mjs';

test('Every docs code block is classified by the docs coverage harness', async () => {
	const report = await buildDocsCoverageReport({ includeCgiNode: false });

	assert.ok(report.summary.total > 100, `Expected more than 100 classified docs blocks, got ${report.summary.total}.`);
	assert.equal(report.summary.byStatus.uncovered ?? 0, 0);
});

test('Docs coverage harness executes a meaningful subset of runtime-backed examples', async () => {
	const report = await buildDocsCoverageReport({ includeCgiNode: false });
	const executableCount = report.summary.byStatus.executable_node ?? 0;

	assert.ok(executableCount >= 30, `Expected at least 30 runtime-backed covered blocks, got ${executableCount}.`);
});

test('Docs coverage report tracks known browser/platform gaps explicitly', async () => {
	const report = await buildDocsCoverageReport({ includeCgiNode: false });
	assert.ok((report.summary.byStatus.allowed_gap ?? 0) > 0);
});
