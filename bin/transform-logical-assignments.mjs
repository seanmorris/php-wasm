#!/usr/bin/env node

import fs from 'node:fs';

import { transformSync } from '@babel/core';
import transformLogicalAssignmentOperators from '@babel/plugin-transform-logical-assignment-operators';

const inputFile = process.argv[2];

if(!inputFile)
{
	throw new Error('Usage: transform-logical-assignments.mjs <input-file>');
}

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
