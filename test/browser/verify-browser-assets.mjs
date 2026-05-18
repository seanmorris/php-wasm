import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const versions = ['8.5', '8.4', '8.3', '8.2', '8.1', '8.0'];

const versionedFamilies = [
	['packages/php-wasm', 'php%s-web.mjs']
	, ['packages/php-cli-wasm', 'php%s-cli-web.mjs']
	, ['packages/php-dbg-wasm', 'php%s-dbg-web.mjs']
	, ['packages/php-cgi-wasm', 'php%s-cgi-worker.mjs']
	, ['packages/dom', '%s.mjs']
	, ['packages/gd', '%s.mjs']
	, ['packages/iconv', '%s.mjs']
	, ['packages/intl', '%s.mjs']
	, ['packages/libyaml', '%s.mjs']
	, ['packages/libzip', '%s.mjs']
	, ['packages/mbstring', '%s.mjs']
	, ['packages/openssl', '%s.mjs']
	, ['packages/simplexml', '%s.mjs']
	, ['packages/sqlite', '%s.mjs']
	, ['packages/tidy', '%s.mjs']
	, ['packages/xml', '%s.mjs']
	, ['packages/zlib', '%s.mjs']
];

const staticFiles = [
	'packages/libxml/index.mjs'
	, 'packages/intl/icudt72l.dat'
	, 'test/browser/server.mjs'
	, 'test/browser/browser.spec.mjs'
];

const missingFiles = [];

for(const file of staticFiles)
{
	if(!fs.existsSync(path.resolve(repoRoot, file)))
	{
		missingFiles.push(file);
	}
}

for(const [directory, pattern] of versionedFamilies)
{
	for(const version of versions)
	{
		const filename = pattern.replace('%s', version);
		const fullPath = path.resolve(repoRoot, directory, filename);

		if(!fs.existsSync(fullPath))
		{
			missingFiles.push(path.join(directory, filename));
		}
	}
}

if(missingFiles.length)
{
	process.stderr.write(
		[
			'Browser CI assets are incomplete.',
			'The static harness imports package version tables that require the full browser runtime corpus for every PHP version.',
			'Missing files:',
			...missingFiles.map(file => ` - ${file}`),
			'Check the artifact pattern for this job and the upstream package build outputs.'
		].join('\n') + '\n'
	);

	process.exit(1);
}

process.stdout.write('Browser CI asset verification passed.\n');
