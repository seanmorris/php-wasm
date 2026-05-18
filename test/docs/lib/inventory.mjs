import fs from 'node:fs';
import path from 'node:path';

import { docsRoot } from './paths.mjs';

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

function parseMarkdownFile(filename)
{
	const source = fs.readFileSync(filename, 'utf8');
	const lines  = source.split(/\r?\n/);
	const blocks = [];
	const headings = [];

	let inFence    = false;
	let fenceInfo  = '';
	let fenceLines = [];
	let fenceStart = 0;

	for(let index = 0; index < lines.length; index++)
	{
		const line = lines[index];

		if(!inFence)
		{
			const headingMatch = line.match(/^(#+)\s+(.*)$/);

			if(headingMatch)
			{
				headings[headingMatch[1].length - 1] = headingMatch[2].trim();
				headings.length = headingMatch[1].length;
			}

			const openMatch = line.match(/^```(.*)$/);

			if(openMatch)
			{
				inFence    = true;
				fenceInfo  = openMatch[1].trim();
				fenceLines = [];
				fenceStart = index + 1;
			}

			continue;
		}

		if(line === '```')
		{
			const relativePath = path.relative(docsRoot, filename);
			const language = parseFenceLanguage(fenceInfo);

			blocks.push({
				id: `${relativePath}#${blocks.length}`,
				file: relativePath,
				index: blocks.length,
				language,
				fenceInfo,
				headingPath: headings.filter(Boolean),
				startLine: fenceStart,
				endLine: index + 1,
				code: fenceLines.join('\n'),
			});

			inFence = false;
			fenceInfo = '';
			fenceLines = [];
			continue;
		}

		fenceLines.push(line);
	}

	return blocks;
}

function parseFenceLanguage(fenceInfo)
{
	if(!fenceInfo)
	{
		return 'plain';
	}

	const trimmed = fenceInfo.trim();
	const classMatch = trimmed.match(/\.\s*([A-Za-z0-9_-]+)/);

	if(classMatch)
	{
		return classMatch[1].toLowerCase();
	}

	const token = trimmed.split(/\s+/)[0];

	return token.replace(/[{}]/g, '').toLowerCase() || 'plain';
}

export function buildDocsInventory()
{
	const files = walkMarkdownFiles(docsRoot).sort();
	const pages = [];
	const blocks = [];

	for(const file of files)
	{
		const pageBlocks = parseMarkdownFile(file);

		pages.push({
			file: path.relative(docsRoot, file),
			blockCount: pageBlocks.length,
		});

		blocks.push(...pageBlocks);
	}

	return {
		docsRoot,
		pages,
		blocks,
	};
}
