import { PhpCgiWebBase } from './PhpCgiWebBase.mjs';

const defaultVersion = '8.4';

/** @import { PhpCgiRuntimeArgs } from 'php-cgi-wasm/public' */

/**
 * WebView-hosted PHP CGI wrapper.
 */
export class PhpCgiWebview extends PhpCgiWebBase
{
	/**
	 * Creates a WebView-hosted PHP CGI runtime.
	 * @param {PhpCgiRuntimeArgs} [options] Runtime configuration.
	 */
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, version = defaultVersion, ...args} = {})
	{
		const constructorArgs = {version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args};

		switch(version)
		{
			case '8.5':
				super(import(`./php8.5-cgi-webview.mjs`), constructorArgs);
				break;

			case '8.4':
				super(import(`./php8.4-cgi-webview.mjs`), constructorArgs);
				break;

			case '8.3':
				super(import(`./php8.3-cgi-webview.mjs`), constructorArgs);
				break;

			case '8.2':
				super(import(`./php8.2-cgi-webview.mjs`), constructorArgs);
				break;

			case '8.1':
				super(import(`./php8.1-cgi-webview.mjs`), constructorArgs);
				break;

			case '8.0':
				super(import(`./php8.0-cgi-webview.mjs`), constructorArgs);
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${version}`);
		}
	}
}
