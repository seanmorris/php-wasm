const fs = require('node:fs');
const path = require('node:path');
const { strict: assert } = require('node:assert');

/**
 * Recursively collect files under a directory.
 * @param {string} directory Directory to walk.
 * @param {string[]} [results] Accumulator for discovered files.
 * @returns {string[]} Discovered absolute file paths.
 */
function walkFiles(directory, results = [])
{
	for(const entry of fs.readdirSync(directory, { withFileTypes: true }))
	{
		const target = path.join(directory, entry.name);

		if(entry.isDirectory())
		{
			walkFiles(target, results);
		}
		else if(entry.isFile())
		{
			results.push(target);
		}
	}

	return results;
}

/**
 * Convert a file path to a URL-style path relative to a root.
 * @param {string} root Root directory.
 * @param {string} file File below the root.
 * @returns {string} Relative URL path.
 */
function relativeUrlPath(root, file)
{
	return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Read alternateName metadata values from generated HTML.
 * @param {string} html Generated HTML.
 * @returns {string[]} alternateName values in document order.
 */
function alternateNames(html)
{
	return [...html.matchAll(
		/<meta\s+itemprop\s*=\s*["']alternateName["']\s+content\s*=\s*["']([^"']+)["']/g
	)].map(match => match[1]);
}

/**
 * Audit generated documentation as a self-contained static site.
 * @param {{docsRoot: string, sourceStaticRoot: string, origin: string}} options Audit inputs.
 * @returns {{htmlPages: number, linksChecked: number, sitemapUrls: number}} Audit totals.
 */
function auditGeneratedSite(options)
{
	const { docsRoot, sourceStaticRoot, origin } = options;
	const files = walkFiles(docsRoot);
	const relativeFiles = new Set(files.map(file => relativeUrlPath(docsRoot, file)));
	const htmlFiles = files.filter(file => file.endsWith('.html'));
	const idsByFile = new Map;
	const links = [];

	for(const file of htmlFiles)
	{
		const relativeFile = relativeUrlPath(docsRoot, file);
		const html = fs.readFileSync(file, 'utf8');
		const ids = new Set(
			[...html.matchAll(/\s(?:id|name)\s*=\s*(["'])(.*?)\1/gi)]
				.map(match => match[2])
		);

		assert.doesNotMatch(html, /https:\/\/https:\/\//, `${relativeFile}: doubled URL scheme`);
		idsByFile.set(relativeFile, ids);

		for(const match of html.matchAll(/\shref\s*=\s*(["'])(.*?)\1/gi))
		{
			links.push({ source: relativeFile, href: match[2].replaceAll('&amp;', '&') });
		}

		for(const match of html.matchAll(/<([A-Za-z][\w:-]*)(\s[^<>]*?)?\/?\s*>/g))
		{
			const attributes = (match[2] ?? '').replace(/"[^"]*"|'[^']*'/g, '=""');
			const seen = new Set;

			for(const attribute of attributes.matchAll(/\s([A-Za-z_:][\w:.-]*)(?=\s|=|\/|$)/g))
			{
				const name = attribute[1].toLowerCase();
				assert.ok(!seen.has(name), `${relativeFile}: duplicate ${name} attribute in <${match[1]}>`);
				seen.add(name);
			}
		}
	}

	for(const { source, href } of links)
	{
		if(!href || /^(?:mailto:|tel:|data:|javascript:)/i.test(href))
		{
			continue;
		}

		const url = new URL(href, `${origin}/${source}`);

		if(url.origin !== origin)
		{
			continue;
		}

		let target = decodeURIComponent(url.pathname).replace(/^\//, '');

		if(!target || target.endsWith('/'))
		{
			target += 'index.html';
		}

		assert.ok(relativeFiles.has(target), `${source}: missing local target ${href}`);

		if(url.hash && target.endsWith('.html'))
		{
			const fragment = decodeURIComponent(url.hash.slice(1));
			assert.ok(idsByFile.get(target)?.has(fragment), `${source}: missing fragment ${href}`);
		}
	}

	const sitemap = fs.readFileSync(path.join(docsRoot, 'sitemap.xml'), 'utf8');
	const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
	const expectedLocations = htmlFiles
		.map(file => relativeUrlPath(docsRoot, file))
		.filter(file => path.basename(file) !== '404.html')
		.filter(file => !/^google[0-9a-f]+\.html$/.test(path.basename(file)))
		.sort()
		.map(file => `${origin}/${file}`);

	assert.deepEqual(locations, expectedLocations, 'Sitemap locations must be absolute, sorted, complete, and unique.');

	for(const location of locations)
	{
		const url = new URL(location);
		assert.equal(url.origin, origin, `Unexpected sitemap origin: ${location}`);
	}

	const metadataExpectations = new Map([
		['methods/php-wasm.html', ['PhpNode', 'PhpWeb']]
		, ['methods/php-cgi-wasm.html', ['PhpCgiNode', 'PhpCgiWorker']]
	]);

	for(const [relativeFile, expected] of metadataExpectations)
	{
		const html = fs.readFileSync(path.join(docsRoot, relativeFile), 'utf8');
		assert.deepEqual(alternateNames(html), expected, `${relativeFile}: alternateName metadata drifted`);
	}

	assert.match(
		fs.readFileSync(path.join(docsRoot, 'contact.html'), 'utf8'),
		/<article itemscope itemtype = "https:\/\/schema\.org\/ContactPage">/
	);

	for(const sourceFile of walkFiles(sourceStaticRoot))
	{
		const relativeFile = path.relative(sourceStaticRoot, sourceFile);
		const generatedFile = path.join(docsRoot, relativeFile);
		assert.ok(fs.existsSync(generatedFile), `Generated static asset is missing: ${relativeFile}`);
		assert.deepEqual(
			fs.readFileSync(generatedFile),
			fs.readFileSync(sourceFile),
			`Generated static asset differs: ${relativeFile}`
		);
	}

	return {
		htmlPages: htmlFiles.length
		, linksChecked: links.length
		, sitemapUrls: locations.length
	};
}

module.exports = { auditGeneratedSite };
