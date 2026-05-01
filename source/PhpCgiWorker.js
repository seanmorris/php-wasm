import { PhpCgiWebBase } from './PhpCgiWebBase';

const defaultVersion = '8.4';

/** @import { PhpCgiRuntimeArgs } from '../packages/php-cgi-wasm/public' */

/**
 * Worker-hosted PHP CGI wrapper.
 */
export class PhpCgiWorker extends PhpCgiWebBase
{
	/**
	 * Creates a worker-hosted PHP CGI runtime.
	 * @param {PhpCgiRuntimeArgs} [options] Runtime configuration.
	 */
	constructor({version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		version = version ?? defaultVersion;

		const constructorArgs = {version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args};

		switch(version)
		{
			case '8.5':
				super(import(`./php8.5-cgi-worker.mjs`), constructorArgs);
				break;

			case '8.4':
				super(import(`./php8.4-cgi-worker.mjs`), constructorArgs);
				break;

			case '8.3':
				super(import(`./php8.3-cgi-worker.mjs`), constructorArgs);
				break;

			case '8.2':
				super(import(`./php8.2-cgi-worker.mjs`), constructorArgs);
				break;

			case '8.1':
				super(import(`./php8.1-cgi-worker.mjs`), constructorArgs);
				break;

			case '8.0':
				super(import(`./php8.0-cgi-worker.mjs`), constructorArgs);
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${version}`);
		}
	}
}
