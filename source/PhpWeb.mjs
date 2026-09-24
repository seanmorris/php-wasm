import { PhpWebBase } from './PhpWebBase.mjs';

const defaultVersion = '8.4';

/**
 * Browser-hosted PHP wrapper.
 */
export class PhpWeb extends PhpWebBase
{
	/**
	 * Creates a browser-hosted PHP runtime.
	 * @param {PhpRuntimeArgs} args Runtime configuration.
	 */
	constructor(args = {})
	{
		const version = args.version ?? defaultVersion;

		const constructorArgs = {version, ...args};

		switch(version)
		{
			case '8.5':
				super(import(`./php8.5-web.mjs`), constructorArgs);
				break;


			case '8.4':
				super(import(`./php8.4-web.mjs`), constructorArgs);
				break;


			case '8.3':
				super(import(`./php8.3-web.mjs`), constructorArgs);
				break;


			case '8.2':
				super(import(`./php8.2-web.mjs`), constructorArgs);
				break;

			case '8.1':
				super(import(`./php8.1-web.mjs`), constructorArgs);
				break;

			case '8.0':
				super(import(`./php8.0-web.mjs`), constructorArgs);
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${version}`);
		}
	}
}
