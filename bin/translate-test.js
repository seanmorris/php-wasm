const fs = require('node:fs');
const readline = require('node:readline');
const { parseArgs } = require('node:util');

const parsedArgs = parseArgs({allowPositionals:true, options: {
	file: { type: 'string' }
	, phpVersion: { type: 'string' }
	, libType: { type: 'string', default: 'shared' }
	, buildType: { type: 'string', default: 'shared' }
}}).values;

async function translate()
{
	const input = fs.createReadStream(parsedArgs.file);
	const reader = readline.createInterface({input, crlfDelay: Infinity});
	const sections = {};

	let currentSection = null;

	for await (const line of reader)
	{
		if(line.match(/^--\w+--$/))
		{
			currentSection = line.substring(2).substring(0, line.length - 4);
			sections[currentSection] = '';
			continue;
		}

		if(!currentSection)
		{
			continue;
		}

		sections[currentSection] += line + "\n";
	}

	console.log(`import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';

test(${JSON.stringify(String(sections.TEST).trim())}, async () => {
	const sharedLibs = [];
	process.env.WITH_ZLIB  === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-zlib.so');
	process.env.WITH_GD    === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-gd.so');
	process.env.WITH_ICONV === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-iconv.so');
	process.env.WITH_INTL  === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-intl.so');
	process.env.WITH_XML   === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-xml.so', 'php${parsedArgs.phpVersion}-dom.so', 'php${parsedArgs.phpVersion}-simplexml.so');
	process.env.WITH_ONIGURUMA === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-mbstring.so');
	process.env.WITH_OPENSSL   === 'dynamic' && sharedLibs.push('php${parsedArgs.phpVersion}-openssl.so');

	const files = [];
	process.env.WITH_INTL === 'dynamic' && files.push({parent: '/preload/', name: 'icudt72l.dat', url: './node_modules/php-wasm-intl/icudt72l.dat'});

	const php = new PhpNode(nodeRuntimeOptions({ sharedLibs, files, persist: { mountPath: '/persist', localPath: process.cwd() + '/test/' } }));

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(${JSON.stringify(sections.FILE)});

	assert.equal(exitCode, 0);
	assert.equal(stdOut, ${JSON.stringify(sections.EXPECT)});
	assert.equal(stdErr, '');

});
`);
}

translate();
