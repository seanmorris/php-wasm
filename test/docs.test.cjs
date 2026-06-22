const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { strict: assert } = require('node:assert');

const { buildDocsCoverageReport } = require('./docs/report.cjs');
const { docsFixtureRoot, phpWasmSiteDocsRoot } = require('./docs/lib/paths.cjs');

function walkMarkdownFiles(directory, results = [])
{
	for(const entry of fs.readdirSync(directory, { withFileTypes: true }))
	{
		const nextPath = path.join(directory, entry.name);

		if(entry.isDirectory())
		{
			walkMarkdownFiles(nextPath, results);
			continue;
		}

		if(entry.isFile() && nextPath.endsWith('.md'))
		{
			results.push(nextPath);
		}
	}

	return results;
}

function normalizeSiteFixtureMarkdown(source)
{
	return source
		.replace(/\r\n/g, '\n')
		.replace(/^(---\n[\s\S]*?\n---\n)\n?<!--[\s\S]*?-->\n/, '$1')
		.replace(/^<!--[\s\S]*?-->\n/, '')
		.trimEnd();
}

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

test(
	'Vendored docs fixture matches php-wasm-site page content',
	{ skip: !fs.existsSync(phpWasmSiteDocsRoot) && 'php-wasm-site checkout not available.' },
	() => {
		const fixtureFiles = walkMarkdownFiles(path.join(docsFixtureRoot, 'pages'))
			.map(file => path.relative(path.join(docsFixtureRoot, 'pages'), file))
			.sort();
		const siteFiles = walkMarkdownFiles(phpWasmSiteDocsRoot)
			.map(file => path.relative(phpWasmSiteDocsRoot, file))
			.sort();

		assert.deepEqual(siteFiles, fixtureFiles);

		for(const relativePath of fixtureFiles)
		{
			const fixtureFile = path.join(docsFixtureRoot, 'pages', relativePath);
			const siteFile = path.join(phpWasmSiteDocsRoot, relativePath);
			const fixtureSource = normalizeSiteFixtureMarkdown(fs.readFileSync(fixtureFile, 'utf8'));
			const siteSource = normalizeSiteFixtureMarkdown(fs.readFileSync(siteFile, 'utf8'));

			assert.equal(siteSource, fixtureSource, `Docs page drifted: ${relativePath}`);
		}
	}
);
