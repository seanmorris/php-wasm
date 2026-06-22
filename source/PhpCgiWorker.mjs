import { PhpCgiWebBase } from './PhpCgiWebBase.mjs';
import Php80CgiWorker from './php8.0-cgi-worker.mjs';
import Php81CgiWorker from './php8.1-cgi-worker.mjs';
import Php82CgiWorker from './php8.2-cgi-worker.mjs';
import Php83CgiWorker from './php8.3-cgi-worker.mjs';
import Php84CgiWorker from './php8.4-cgi-worker.mjs';
import Php85CgiWorker from './php8.5-cgi-worker.mjs';

const defaultVersion = '8.4';
const runtimes = {
	'8.0': Php80CgiWorker
	, '8.1': Php81CgiWorker
	, '8.2': Php82CgiWorker
	, '8.3': Php83CgiWorker
	, '8.4': Php84CgiWorker
	, '8.5': Php85CgiWorker
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
		const runtime = runtimes[version];

		if(!runtime)
		{
			throw new Error(`Unsupported PHP runtime: ${version}`);
		}

		super(Promise.resolve({default: runtime}), constructorArgs);
	}
}
