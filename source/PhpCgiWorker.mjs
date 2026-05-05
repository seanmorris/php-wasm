import { PhpCgiWebBase } from './PhpCgiWebBase.mjs';
import php8_5 from './php8.5-cgi-worker.mjs';
import php8_4 from './php8.4-cgi-worker.mjs';
import php8_3 from './php8.3-cgi-worker.mjs';
import php8_2 from './php8.2-cgi-worker.mjs';
import php8_1 from './php8.1-cgi-worker.mjs';
import php8_0 from './php8.0-cgi-worker.mjs';

const defaultVersion = '8.4';

const versionTable = {
	'8.5': php8_5
	, '8.4': php8_4
	, '8.3': php8_3
	, '8.2': php8_2
	, '8.1': php8_1
	, '8.0': php8_0
};

/** @import { PhpCgiRuntimeArgs } from 'php-cgi-wasm/public' */

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

		if(!(version in versionTable))
		{
			throw new Error(`Unsupported PHP runtime: ${version}`);
		}

		super(Promise.resolve({default: versionTable[version]}), constructorArgs);
	}
}
