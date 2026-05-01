import { PhpBase } from './PhpBase';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const defaultVersion = (
	process.env.PHP_VERSION === '8.5'
	|| process.env.PHP_VERSION === '8.4'
	|| process.env.PHP_VERSION === '8.3'
	|| process.env.PHP_VERSION === '8.2'
	|| process.env.PHP_VERSION === '8.1'
	|| process.env.PHP_VERSION === '8.0'
)
	? process.env.PHP_VERSION
	: '8.4';

const defaultVariant = process.env.PHP_VARIANT === '_sdl'
	? process.env.PHP_VARIANT
	: '';

/**
 * Node.js-hosted PHP wrapper.
 */
export class PhpNode extends PhpBase
{
	/**
	 * Creates a Node.js-hosted PHP runtime.
	 * @param {PhpRuntimeArgs} args Runtime configuration.
	 */
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

		const version = args.version ?? defaultVersion;
		const variant = args.variant ?? defaultVariant;
		const vvId = version + variant;

		const constructorArgs = {locateFile, version, variant, ...args};

		switch(vvId)
		{
			case '8.5':
				super(import(`./php8.5-node.mjs`), constructorArgs);
				break;

			case '8.5_sdl':
				super(import(`./php8.5_sdl-node.mjs`), constructorArgs);
				break;

			case '8.4':
				super(import(`./php8.4-node.mjs`), constructorArgs);
				break;

			case '8.4_sdl':
				super(import(`./php8.4_sdl-node.mjs`), constructorArgs);
				break;

			case '8.3':
				super(import(`./php8.3-node.mjs`), constructorArgs);
				break;

			case '8.3_sdl':
				super(import(`./php8.3_sdl-node.mjs`), constructorArgs);
				break;

			case '8.2':
				super(import(`./php8.2-node.mjs`), constructorArgs);
				break;
			case '8.2_sdl':
				super(import(`./php8.2_sdl-node.mjs`), constructorArgs);
				break;

			case '8.1':
				super(import(`./php8.1-node.mjs`), constructorArgs);
				break;
			case '8.1_sdl':
				super(import(`./php8.1_sdl-node.mjs`), constructorArgs);
				break;

			case '8.0':
				super(import(`./php8.0-node.mjs`), constructorArgs);
				break;
			case '8.0_sdl':
				super(import(`./php8.0_sdl-node.mjs`), constructorArgs);
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${vvId}`);
		}
	}
}
