import { PhpCgiWebBase } from './PhpCgiWebBase';

const defaultVersion = '8.4';

/**
 * Browser-hosted PHP CGI wrapper.
 */
export class PhpCgiWeb extends PhpCgiWebBase
{
	/**
	 * Creates a browser-hosted PHP CGI runtime.
	 * @param {object} [options] Runtime configuration.
	 * @param {string} [options.version] PHP version identifier used by the loader.
	 * @param {string} [options.docroot] Virtual document root served by the runtime.
	 * @param {string} [options.prefix] URL path prefix routed into the PHP runtime.
	 * @param {(path: string) => string|{scriptName: string, path: string}} [options.rewrite] URL rewrite callback.
	 * @param {string} [options.entrypoint] Default PHP entrypoint relative to the document root.
	 * @param {string} [options.cookies] Persisted cookie data to hydrate the cookie jar with.
	 * @param {{[key: string]: string}} [options.types] Mapping of file extensions to response MIME types.
	 * @param {PhpRuntimeHook} [options.onRequest] Hook invoked for each handled request.
	 * @param {PhpNotFoundHook} [options.notFound] Custom 404 handler.
	 * @param {PhpLibraryList} [options.sharedLibs] Shared libraries that may be loaded through `php.ini`.
	 * @param {PhpLibraryList} [options.dynamicLibs] Shared libraries that should only be preloaded dynamically.
	 * @param {{[key: string]: PhpActionHandler}} [options.actions] Extra message actions exposed by the wrapper.
	 * @param {PhpPreloadFileList} [options.files] Additional preload files to mount into the runtime.
	 * @param {boolean} [options.autoTransaction] Automatically opens and commits FS transactions around requests.
	 * @param {number} [options.maxRequestAge] Maximum request age in milliseconds before timing out.
	 * @param {number} [options.staticCacheTime] Static asset cache lifetime in milliseconds.
	 * @param {number} [options.dynamicCacheTime] Dynamic response cache lifetime in milliseconds.
	 * @param {PhpVhostList} [options.vHosts] Virtual host routing rules.
	 * @param {{[key: string]: string}} [options.env] Environment variables to set inside the runtime.
	 */
	constructor({version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version ?? defaultVersion}-cgi-web.mjs`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
