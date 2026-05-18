import { PhpBase } from './PhpBase.mjs';
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

const defaultVariant = '';
const normalizeRuntimeModule = runtime => runtime && typeof runtime === 'object' && 'default' in runtime
	? runtime
	: {default: runtime};

const loadRuntime = specifier => {
	if(typeof require === 'function')
	{
		return Promise.resolve(
			normalizeRuntimeModule(require(specifier.replace(/\.mjs$/, '.js')))
		);
	}

	return import(specifier).then(normalizeRuntimeModule);
};

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
				super(loadRuntime('./php8.5-node.mjs'), constructorArgs);
				break;

			case '8.4':
				super(loadRuntime('./php8.4-node.mjs'), constructorArgs);
				break;

			case '8.3':
				super(loadRuntime('./php8.3-node.mjs'), constructorArgs);
				break;

			case '8.2':
				super(loadRuntime('./php8.2-node.mjs'), constructorArgs);
				break;

			case '8.1':
				super(loadRuntime('./php8.1-node.mjs'), constructorArgs);
				break;

			case '8.0':
				super(loadRuntime('./php8.0-node.mjs'), constructorArgs);
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${vvId}`);
		}
	}
}
