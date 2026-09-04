#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { docsFixtureRoot, phpWasmSiteRoot } from './lib/paths.mjs';

const fixturePagesRoot = path.join(docsFixtureRoot, 'pages');
const sitePagesRoot = path.join(phpWasmSiteRoot, 'pages');
const vendorCommentPattern = /<!--\nVendored from php-wasm-site[\s\S]*?\n-->\n?/;

/**
 * Recursively collect markdown files under a directory.
 * @param {string} directory Directory to walk.
 * @param {string[]} [results] Accumulator for discovered files.
 * @returns {string[]} Discovered markdown file paths.
 */
function walkMarkdownFiles(directory, results = [])
{
	for(const entry of fs.readdirSync(directory, { withFileTypes: true }))
	{
		const target = path.join(directory, entry.name);

		if(entry.isDirectory())
		{
			walkMarkdownFiles(target, results);
		}
		else if(entry.isFile() && target.endsWith('.md'))
		{
			results.push(target);
		}
	}

	return results;
}

/**
 * Strip the fixture provenance comment before comparing page content.
 * @param {string} source Fixture markdown.
 * @returns {string} Normalized page content.
 */
function withoutVendorComment(source)
{
	return source.replace(vendorCommentPattern, '').trimEnd();
}

/**
 * Preserve validation references from an existing fixture comment.
 * @param {string} source Fixture markdown.
 * @returns {string} Validation-reference lines.
 */
function validationReferences(source)
{
	const comment = source.match(vendorCommentPattern)?.[0] ?? '';
	return comment.match(/Validation refs:\n([\s\S]*?)\n-->/)?.[1] ?? '';
}

/**
 * Add fixture provenance immediately after optional frontmatter.
 * @param {string} source Source markdown.
 * @param {string} relativePath Page path relative to the source pages directory.
 * @param {string} revision Source repository commit.
 * @param {string} references Validation-reference lines to retain.
 * @returns {string} Markdown with provenance.
 */
function withVendorComment(source, relativePath, revision, references)
{
	const referenceLines = references ? `\nValidation refs:\n${references}` : '';
	const comment = [
		'<!--'
		, `Vendored from php-wasm-site commit ${revision}`
		, `Source: https://github.com/seanmorris/php-wasm-site/blob/${revision}/pages/${relativePath}${referenceLines}`
		, '-->'
	].join('\n');

	if(source.startsWith('---\n'))
	{
		const frontmatterEnd = source.indexOf('\n---\n', 4);

		if(frontmatterEnd < 0)
		{
			throw new Error(`Unclosed frontmatter: ${relativePath}`);
		}

		const insertionPoint = frontmatterEnd + 5;
		return `${source.slice(0, insertionPoint)}${comment}\n${source.slice(insertionPoint)}`;
	}

	return `${comment}\n${source}`;
}

if(!fs.existsSync(sitePagesRoot))
{
	throw new Error(`php-wasm-site pages not found: ${sitePagesRoot}`);
}

const revision = execFileSync('git', ['-C', phpWasmSiteRoot, 'rev-parse', 'HEAD'], {
	encoding: 'utf8'
}).trim();

if(!/^[0-9a-f]{40}$/.test(revision))
{
	throw new Error(`Invalid php-wasm-site revision: ${revision}`);
}

const fixtureFiles = walkMarkdownFiles(fixturePagesRoot);
const siteFiles = walkMarkdownFiles(sitePagesRoot)
	.map(file => path.relative(sitePagesRoot, file))
	.sort();
const fixtureRelativeFiles = fixtureFiles
	.map(file => path.relative(fixturePagesRoot, file))
	.sort();

if(JSON.stringify(siteFiles) !== JSON.stringify(fixtureRelativeFiles))
{
	throw new Error('The php-wasm-site and fixture page inventories differ.');
}

const changed = [];

for(const relativePath of siteFiles)
{
	const fixtureFile = path.join(fixturePagesRoot, relativePath);
	const siteSource = fs.readFileSync(path.join(sitePagesRoot, relativePath), 'utf8').trimEnd();
	const fixtureSource = fs.readFileSync(fixtureFile, 'utf8');

	if(withoutVendorComment(fixtureSource) === siteSource)
	{
		continue;
	}

	const synchronized = withVendorComment(
		siteSource,
		relativePath.split(path.sep).join('/'),
		revision,
		validationReferences(fixtureSource)
	);

	fs.writeFileSync(fixtureFile, `${synchronized}\n`);
	changed.push(relativePath);
}

const readmeFile = path.join(docsFixtureRoot, 'README.md');
const readme = fs.readFileSync(readmeFile, 'utf8');
const nextReadme = readme.replace(/^- Commit: `[0-9a-f]{40}`$/m, `- Commit: \`${revision}\``);

if(nextReadme === readme)
{
	if(!readme.includes(`- Commit: \`${revision}\``))
	{
		throw new Error('Fixture README does not contain a replaceable commit line.');
	}
}
else
{
	fs.writeFileSync(readmeFile, nextReadme);
}

for(const relativePath of changed)
{
	console.log(relativePath);
}

console.log(`Synchronized ${changed.length} changed page(s) from ${revision}.`);
