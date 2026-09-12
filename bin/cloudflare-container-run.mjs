#!/usr/bin/env node
// The isolated build already runs inside the builder image. Interpret the small
// docker-compose run argument subset used by Make, without nesting Docker.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const env = {...process.env};
let cwd = '/src';
while(args.length)
{
	const arg = args.shift();
	if(arg === 'emscripten-builder') break;
	if(arg === '-p') { args.shift(); continue; }
	if(['run', '-T', '--rm'].includes(arg)) continue;
	if(arg === '-w') { cwd = args.shift(); continue; }
	if(arg === '-e')
	{
		const value = args.shift();
		const equal = value.indexOf('=');
		if(equal >= 0) env[value.slice(0, equal)] = value.slice(equal + 1);
		continue;
	}
	throw new Error(`Unsupported container command option: ${arg}`);
}
if(!args.length) throw new Error('Missing build command');
const child = spawn(args.shift(), args, {cwd, env, stdio: 'inherit'});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code; });
