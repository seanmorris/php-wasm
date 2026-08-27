#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { transformSync } from '@babel/core';
import transformLogicalAssignmentOperators from '@babel/plugin-transform-logical-assignment-operators';

/**
 * Rewrites logical assignment operators in a generated CommonJS runtime.
 * @param {string} inputFile Generated JavaScript file to update atomically.
 * @returns {void} Nothing.
 */
export function transformLogicalAssignments(inputFile)
{
	const input = fs.readFileSync(inputFile, 'utf8');
	const transformed = transformSync(input, {
		babelrc: false
		, comments: true
		, compact: true
		, configFile: false
		, filename: inputFile
		, plugins: [transformLogicalAssignmentOperators]
		, sourceMaps: false
		, sourceType: 'script'
	});

	if(!transformed?.code)
	{
		throw new Error(`Babel did not generate output for ${inputFile}`);
	}

	const temporaryFile = `${inputFile}.logical-assignments.${process.pid}.tmp`;

	try
	{
		fs.writeFileSync(temporaryFile, `${transformed.code}\n`);
		fs.renameSync(temporaryFile, inputFile);
	}
	finally
	{
		if(fs.existsSync(temporaryFile))
		{
			fs.unlinkSync(temporaryFile);
		}
	}
}

const invokedFile = process.argv[1]
	? pathToFileURL(path.resolve(process.argv[1])).href
	: undefined;

if(invokedFile === import.meta.url)
{
	const inputFile = process.argv[2];

	if(!inputFile)
	{
		throw new Error('Usage: transform-logical-assignments.mjs <input-file>');
	}

	transformLogicalAssignments(inputFile);
}
