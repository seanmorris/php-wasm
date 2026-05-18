import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildDocsCoverageReport } from './docs/report.mjs';

test('Every CGI docs code block is classified by the docs coverage harness', async () => {
	const report = await buildDocsCoverageReport({
		includeCgiNode: true,
		includeBrowserOnly: false,
	});

	assert.ok(report.summary.total > 0, 'Expected CGI docs coverage to include at least one code block.');
	assert.equal(report.summary.byStatus.uncovered ?? 0, 0);
});

test('CGI docs coverage harness executes runtime-backed CGI examples', async () => {
	const report = await buildDocsCoverageReport({
		includeCgiNode: true,
		includeBrowserOnly: false,
	});

	assert.ok(
		(report.summary.byStatus.executable_cgi_node ?? 0) >= 2,
		`Expected at least 2 CGI runtime-backed covered blocks, got ${report.summary.byStatus.executable_cgi_node ?? 0}.`
	);
});
