// Test-only stand-ins: CI unit tests run before tree/brotli are installed.
import fs from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const [command, ...args] = process.argv.slice(2);
if(command === 'tree')
{
	const names = fs.readdirSync('.').filter(name => name !== 'index.html');
	process.stdout.write(`<html>\n<head>\n</head>\n<body>\n${names.map(name => `<a href="${name}">${name}</a>`).join('\n')}\n</body>\n</html>\n`);
}
else
{
	const name = args.at(-1);
	const bytes = fs.readFileSync(name);
	fs.writeFileSync(name + (command === 'brotli' ? '.br' : '.gz'), command === 'brotli' ? brotliCompressSync(bytes) : gzipSync(bytes));
}
