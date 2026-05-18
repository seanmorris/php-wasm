#!/usr/bin/env node

(async () => {
	const { buildDocsCoverageReport } = await import('../test/docs/report.mjs');
	const report = await buildDocsCoverageReport();
	process.stdout.write(JSON.stringify(report, null, 2) + '\n');
})().catch(error => {
	console.error(error);
	process.exit(1);
});
