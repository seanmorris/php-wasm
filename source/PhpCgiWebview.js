import { PhpCgiWebBase } from './PhpCgiWebBase';

const defaultVersion = '8.4';

/**
 * WebView-hosted PHP CGI wrapper.
 */
export class PhpCgiWebview extends PhpCgiWebBase
{
	/**
	 * Creates a WebView-hosted PHP CGI runtime.
	 * @param {object} options Runtime configuration.
	 * @param {string} options.docroot Virtual document root served by the runtime.
	 * @param {string} options.prefix URL path prefix routed into the PHP runtime.
	 * @param {(path: string) => string|{scriptName: string, path: string}} options.rewrite URL rewrite callback.
	 * @param {string} options.cookies Persisted cookie data to hydrate the cookie jar with.
	 * @param {{[key: string]: string}} options.types Mapping of file extensions to response MIME types.
	 * @param {(request: Request, response?: Response) => unknown} options.onRequest Hook invoked for each handled request.
	 * @param {(request: Request) => Response|string|undefined} options.notFound Custom 404 handler.
	 */
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version ?? defaultVersion}-cgi-webview.mjs`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
