import { PhpBase } from './PhpBase';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const defaultVersion = process.env.PHP_VERSION ?? '8.4';

export class PhpNode extends PhpBase
{
	constructor(args = {})
	{
		const locateFile = (name, dir) => {
			if(name.substr(0, 7) === 'file://')
			{
				name = new URL(name).pathname;
			}

			if(dir === '')
			{
				if(typeof __dirname === 'undefined')
				{
					dir = path.dirname(url.fileURLToPath(import.meta.url));
				}
				else
				{
					dir = __dirname;
				}
			}

			const located = path.resolve(path.format({dir, name}));

			if(fs.existsSync(located))
			{
				return located;
			}
		};

		super(import(`./php${args.version ?? defaultVersion}-node.mjs`), {locateFile, ...args});
	}
}
