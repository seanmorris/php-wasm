import { parseResponse } from './parseResponse.mjs';
import { breakoutRequest } from './breakoutRequest.mjs';
import { fsOps } from './fsOps.mjs';
import { resolveDependencies } from './resolveDependencies.mjs';

/** @import { PhpCgiRuntimeArgs } from 'php-cgi-wasm/public' */

/**
 * An object representing a dynamically loaded data file.
 * @typedef {string|object} FileDef
 * @property {string} url URL used to preload the file.
 * @property {string} path Virtual filesystem path where the file should be mounted.
 * @property {string} parent Parent directory for the mounted file.
 */

/**
 * A string or object representing a dynamically loaded shared library.
 * @typedef {string|object} LibDef
 * @property {string} name Shared library filename.
 * @property {string} url URL used to preload the shared library.
 * @property {boolean} ini Indicates whether the library should be loaded via `php.ini`.
 * @property {function(object):LibDef[]} getLibs Returns additional dependent shared libraries.
 * @property {function(object):FileDef[]} getFiles Returns additional dependent preload files.
 */

const STR = 'string';
const NUM = 'number';

const putEnv = (php, key, value) => php.ccall(
	'wasm_sapi_cgi_putenv'
	, 'number'
	, ['string', 'string']
	, [key, value]
);

const requestTimes = new WeakMap;

const noTrailingSlash = s => s.slice(-1) !== '/' ? s : s.slice(0, -1);
const noLeadingSlash = s => s.slice(0, 1) !== '/' ? s : s.slice(1);
const joinPaths = (...args) => [
	noTrailingSlash(args[0]) // Don't strip the leading slash on the first segment...
	, ...args.slice(1).map( a => noLeadingSlash(noTrailingSlash(a)) )
].join('/');

/**
 * Stores and filters cookies for CGI requests.
 *
 */
class CookieJar
{
	/**
	 * Creates an in-memory cookie jar.
	 * @param {string} [rawCookies] Newline-delimited raw cookie strings to preload.
	 */
	constructor(rawCookies = '')
	{
		if(rawCookies)
		{
			this.load(rawCookies);
		}
	}

	/**
	 *
	 */
	cookies = new Map;
	/**
	 * Stores a raw cookie string in the in-memory jar.
	 * @param {string} rawCookie Raw `Set-Cookie` header value to persist.
	 */
	store(rawCookie)
	{
		let name = null;

		const cookie = {created: Date.now(), raw: rawCookie};

		const parts = rawCookie.split(';').map(p => p.trim() );

		for(const part of parts)
		{
			const equal = part.indexOf('=');

			const key   = part.substr(0, equal);
			const value = part.substr(1 + equal);

			const lowerKey = key.toLowerCase();

			if(!name)
			{
				name = key;
				cookie.name = key;
				cookie.value = value;
			}
			else if(lowerKey === 'expires')
			{
				cookie[lowerKey] = new Date(value).getTime();
			}
			else if(lowerKey === 'max-age')
			{
				cookie[lowerKey] = 1000 * Number(value);
			}
			else
			{
				cookie[lowerKey] = value;
			}
		}

		if(cookie.expires && cookie.created >= cookie.expires)
		{
			this.cookies.delete(cookie.name);
		}
		else
		{
			this.cookies.set(cookie.name, cookie);
		}
	}

	/**
	 * Returns cookies that match a request path.
	 * @param {?string} path Request path used to filter matching cookies.
	 * @returns {object[]} Cookies that should be sent for the path.
	 */
	retrieve(path = null)
	{
		const cookies = [];

		const now = Date.now();

		for(const cookie of this.cookies.values())
		{
			if(cookie.expires && cookie.expires <= now)
			{
				this.cookies.delete(cookie.name);
				continue;
			}

			if(cookie['max-age'] && cookie['max-age'] >= now - cookie.created)
			{
				this.cookies.delete(cookie.name);
				continue;
			}

			if(path === null || !cookie.path || cookie.path === path.substr(0, cookie.path.length))
			{
				cookies.push(cookie);
			}
		}

		return cookies;
	}

	/**
	 * Serializes cookies for persistence.
	 * @param {?string} path Request path used to filter matching cookies.
	 * @returns {string} Serialized cookies for persistence.
	 */
	dump(path = null)
	{
		return this.retrieve(path).map(c => c.raw).join('\n');
	}

	/**
	 * Hydrates the jar from serialized cookie lines.
	 * @param {string} rawCookies Newline-delimited raw cookie strings to restore.
	 */
	load(rawCookies)
	{
		rawCookies.trim().split('\n').map(line => this.store(line));
	}

	/**
	 * Formats cookies as a request header value.
	 * @param {?string} path Request path used to filter matching cookies.
	 * @returns {string} Cookie header value for the path.
	 */
	toEnv(path = null)
	{
		return this.retrieve(path).map(e => `${e.name}=${e.value}`).join(';');
	}
}

/**
 * Shared PHP CGI runtime wrapper used by browser, worker, and Node adapters.
 */
export class PhpCgiBase
{
	/**
	 *
	 */
	docroot    = null;
	/**
	 *
	 */
	prefix     = '/php-wasm';
	/**
	 *
	 */
	exclude    = [];
	/**
	 * Rewrites an incoming request path before routing.
	 * @param {string} path Request path to rewrite before PHP handles it.
	 * @returns {string|{scriptName: string, path: string}} Rewritten request path.
	 */
	rewrite    = path => path;
	/**
	 *
	 */
	cookies    = null;
	/**
	 *
	 */
	types      = {};
	/**
	 * Invokes request lifecycle hooks after a response is generated.
	 * @param {RuntimeRequest} request Request that was handled by the runtime.
	 * @param {Response} [response] Response generated by the runtime.
	 */
	onRequest  = (request, response) => {};
	/**
	 * Generates a fallback response when no PHP entrypoint matches a request.
	 * @param {RuntimeRequest} request Request that could not be resolved to a PHP entrypoint.
	 */
	notFound   = request => {};
	/**
	 *
	 */
	sharedLibs = [];
	/**
	 *
	 */
	dynamicLibs = [];
	/**
	 *
	 */
	files      = [];
	/**
	 *
	 */
	phpArgs    = {};

	/**
	 *
	 */
	maxRequestAge    = 0;
	/**
	 *
	 */
	staticCacheTime  = 60_000;
	/**
	 *
	 */
	dynamicCacheTime = 0;
	/**
	 *
	 */
	vHosts = [];

	/**
	 *
	 */
	php        = null;
	/**
	 *
	 */
	input      = [];
	/**
	 *
	 */
	output     = [];
	/**
	 *
	 */
	error      = [];
	/**
	 *
	 */
	binLoader  = null;
	/**
	 *
	 */
	phpVersion = null;
	/**
	 *
	 */
	entrypoint = null;
	/**
	 *
	 */
	cookieJar  = null;
	/**
	 *
	 */
	extraActions = {};
	/**
	 *
	 */
	autoTransaction = true;
	/**
	 *
	 */
	transactionStarted = false;
	/**
	 *
	 */
	env = {};
	/**
	 *
	 */
	binary = null;
	/**
	 *
	 */
	count      = 0;

	/**
	 *
	 */
	queue = [];

	/**
	 * Creates a new PHP CGI runtime wrapper.
	 * @param {Promise<{default: new (args: object) => object}>} phpBinLoader Deferred PHP module loader.
	 * @param {PhpCgiRuntimeArgs} [options] Runtime configuration for the CGI wrapper.
	 */
	constructor(phpBinLoader, {version, docroot, prefix, exclude, rewrite, entrypoint, cookies, types, onRequest, notFound, sharedLibs, dynamicLibs, actions, files, ...args} = {})
	{
		this.binLoader  = phpBinLoader;
		this.phpVersion = version;
		this.docroot    = docroot      || this.docroot;
		this.prefix     = prefix       || this.prefix;
		this.exclude    = exclude      || this.exclude;
		this.rewrite    = rewrite      || this.rewrite;
		this.entrypoint = entrypoint   || this.entrypoint;
		this.cookieJar  = new CookieJar(cookies);
		this.types      = types        || this.types;
		this.onRequest  = onRequest    || this.onRequest;
		this.notFound   = notFound     || this.notFound;
		this.sharedLibs = sharedLibs   || this.sharedLibs;
		this.dynamicLibs = dynamicLibs || this.dynamicLibs;
		this.files      = files        || this.files;
		this.extraActions = actions    || {};

		this.phpArgs = args;

		this.autoTransaction = ('autoTransaction' in args) ? args.autoTransaction : true;
		this.transactionStarted = false;

		this.maxRequestAge    = args.maxRequestAge    || this.maxRequestAge;
		this.staticCacheTime  = args.staticCacheTime  || this.staticCacheTime;
		this.dynamicCacheTime = args.dynamicCacheTime || this.dynamicCacheTime;
		this.vHosts = args.vHosts || [];

		this.env = {};

		Object.assign(this.env, args.env || {});

		this.refresh();
	}

	/**
	 * Handles the service worker install lifecycle event.
	 * @param {RuntimeLifecycleEvent} event Service worker install event.
	 * @returns {void} Registers the install work with the service worker lifecycle.
	 */
	handleInstallEvent(event)
	{
		return event.waitUntil(globalThis.skipWaiting());
	}

	/**
	 * Handles the service worker activate lifecycle event.
	 * @param {RuntimeLifecycleEvent} event Service worker activate event.
	 * @returns {void} Registers the activate work with the service worker lifecycle.
	 */
	handleActivateEvent(event)
	{
		return event.waitUntil(globalThis.clients.claim());
	}

	/**
	 * Handles control messages sent to the CGI runtime.
	 * @param {MessageEvent} event Message event carrying a control action.
	 * @returns {Promise<void>} Resolves after the action response has been posted back.
	 */
	async handleMessageEvent(event)
	{
		const { data, source } = event;
		const { action, token, params = [] } = data;

		const actions = [
			'analyzePath'
			, 'readdir'
			, 'readFile'
			, 'stat'
			, 'mkdir'
			, 'rmdir'
			, 'writeFile'
			, 'rename'
			, 'unlink'
			, 'putEnv'
			, 'refresh'
			, 'getSettings'
			, 'setSettings'
			, 'getEnvs'
			, 'setEnvs'
			, 'storeInit'
		];

		await this.binary;

		if(actions.includes(action))
		{
			let result, error;

			try
			{
				result = await this[action](...params);
			}
			catch(_error)
			{
				error = JSON.parse(JSON.stringify(_error));
				console.warn(_error);
			}
			finally
			{
				if(action === 'refresh') result = !!result;

				source.postMessage({re: token, result, error});
			}
		}
		else if(action in this.extraActions)
		{
			let result, error;

			try
			{
				result = await this.extraActions[action](this, ...params);
			}
			catch(_error)
			{
				error = JSON.parse(JSON.stringify(_error));
				console.warn(_error);
			}
			finally
			{
				source.postMessage({re: token, result, error});
			}
		}
	}

	/**
	 * Routes eligible fetch events through the CGI runtime.
	 * @param {RuntimeFetchEvent} event Fetch event to route through PHP when eligible.
	 * @returns {Promise<Response>|undefined} Response promise when the request is handled by PHP.
	 */
	handleFetchEvent(event)
	{
		const url = new URL(event.request.url);
		const prefix = this.prefix;

		const {files: sharedLibFiles, urlLibs: sharedLibUrls} = resolveDependencies(this.sharedLibs, this);
		const {files: dynamicLibFiles, urlLibs: dynamicLibUrls} = resolveDependencies(this.dynamicLibs, this);

		let isWhitelisted = false;
		let isBlacklisted = false;

		if(globalThis.location)
		{
			const libFiles = [...sharedLibFiles, ...dynamicLibFiles];
			const libUrls = {...sharedLibUrls, ...dynamicLibUrls};

			const staticUrls = [self.location.pathname, ...libFiles.map(file => file.url), ...Object.values(libUrls)]
			.map(url => new URL(url, self.location.origin))
			.filter(url => url.origin === self.location.origin)
			.map(url => url.pathname);

			isWhitelisted = url.pathname.substr(0, prefix.length) === prefix && url.hostname === self.location.hostname;
			isBlacklisted = !!url.pathname.match(/\.wasm$/i)
			|| staticUrls.includes(url.pathname)
			|| (this.exclude.findIndex(exclude => url.pathname.substr(0, exclude.length) === exclude) > -1)
			|| false;
		}
		else
		{
			isWhitelisted = url.pathname.substr(0, prefix.length) === prefix;
			isBlacklisted = !!url.pathname.match(/\.wasm$/i)
			|| (this.exclude.findIndex(exclude => url.pathname.substr(0, exclude.length) === exclude) > -1)
			|| false;
		}

		if(isWhitelisted && !isBlacklisted)
		{
			requestTimes.set(event.request, Date.now());
			const response = Promise.resolve(this.request(event.request)).then(response => {
				return response instanceof Response
					? response
					: new Response(String(response ?? '404 - Not Found.'), {status: 404});
			});
			event.respondWith(response);
			return response;
		}
	}

	/**
	 * Schedules an async CGI operation on the runtime queue.
	 * @param {PhpQueuedCallback} callback Async operation to queue.
	 * @param {PhpQueueParams} params Arguments passed to the queued callback.
	 * @param {boolean} readOnly Indicates whether the queued operation mutates state.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the queued callback result.
	 */
	async _enqueue(callback, params = [], readOnly = false)
	{
		let accept, reject;

		const coordinator = new Promise((a,r) => [accept, reject] = [a, r]);

		this.queue.push([callback, params, accept, reject]);

		if(!this.queue.length)
		{
			return;
		}

		while(this.queue.length)
		{
			const [callback, params, accept, reject] = this.queue.shift();
			await callback(...params).then(accept).catch(reject);
		}

		return coordinator;
	}

	/**
	 * Recreates the underlying CGI PHP module instance.
	 * @returns {Promise<object>} Deferred PHP module instance.
	 */
	refresh()
	{
		const {files: sharedLibFiles, libs: sharedLibs, urlLibs: sharedLibUrls} = resolveDependencies(this.sharedLibs, this);
		const {files: dynamicLibFiles, libs: dynamicLibs, urlLibs: dynamicLibUrls} = resolveDependencies(this.dynamicLibs, this);

		const userLocateFile = this.phpArgs.locateFile || (() => undefined);

		const locateFile = (path, directory) => {
			let located = userLocateFile(path, directory);
			if(located !== undefined)
			{
				return located;
			}

			if(sharedLibUrls[path])
			{
				const sharedLibUrl = new URL(String(sharedLibUrls[path]), globalThis.location?.href);

				if(sharedLibUrl.protocol === 'file:')
				{
					return sharedLibUrl.pathname;
				}

				return String(sharedLibUrl);
			}

			if(dynamicLibUrls[path])
			{
				const dynamicLibUrl = new URL(String(dynamicLibUrls[path]), globalThis.location?.href);

				if(dynamicLibUrl.protocol === 'file:')
				{
					return dynamicLibUrl.pathname;
				}

				return String(dynamicLibUrl);
			}

			// Suppress attempt to load libxml when
			// it hasn't been provided in sharedLibs
			if(path === 'libxml2.so')
			{
				return 'data:,';
			}
		};

		const phpArgs = {
			persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
			, ...this.phpArgs
			, stdin: () => this.input
				? String(this.input.shift()).charCodeAt(0)
				: null
			, stdout: x => this.output.push(x)
			, stderr: x => this.error.push(x)
			, locateFile
		};

		return this.binary = this.binLoader.then(({default: PHP}) => new PHP(phpArgs)).then(async php => {
			await php.ccall(
				'pib_storage_init'
				, NUM
				, []
				, []
				, {async: true}
			);

			if(!php.FS.analyzePath('/preload').exists)
			{
				php.FS.mkdir('/preload');
			}

			const allFiles = this.files.concat(sharedLibFiles).concat(dynamicLibFiles);

			// Make sure folder structure exists before preloading files
			allFiles.forEach(fileDef => {
				const segments = fileDef.parent.split('/');
				let currentPath = '';
				for(const segment of segments)
				{
					if(!segment) continue;

					currentPath += segment + '/';
					if(!php.FS.analyzePath(currentPath).exists)
					{
						php.FS.mkdir(currentPath);
					}
				}
			});

			await Promise.all(allFiles.map(fileDef => php.FS.createPreloadedFile(
				fileDef.parent, fileDef.name, userLocateFile(fileDef.url) ?? fileDef.url, true, false
			)));

			const iniLines = sharedLibs.map(lib => {
				if(typeof lib === 'string' || lib instanceof URL)
				{
					return `extension=${lib}`;
				}
				else if(typeof lib === 'object' && lib.ini)
				{
					return `extension=${String(lib.url).split('/').pop()}`;
				}
			});

			this.phpArgs.ini && iniLines.push(this.phpArgs.ini.replace(/\n\s+/g, '\n'));

			php.FS.writeFile('/php.ini', iniLines.join("\n") + "\n", {encoding: 'utf8'});

			await php.ccall(
				'wasm_sapi_cgi_init'
				, 'number'
				, []
				, []
				, {async: true}
			);

			const cookieStat = php.FS.analyzePath('/config/.cookies');

			if(cookieStat.exists)
			{
				this.cookieJar.load(php.FS.readFile('/config/.cookies', {encoding: 'utf8'}));
			}

			this.loadInit(php);

			return php;
		});
	}

	/**
	 * Runs before each PHP request.
	 * @returns {Promise<void>} Resolves when any request pre-work has completed.
	 */
	async _beforeRequest()
	{}

	/**
	 * Runs after each successful PHP request.
	 * @returns {Promise<void>} Resolves when any request cleanup has completed.
	 */
	async _afterRequest()
	{}

	/**
	 * Serves a request through the CGI runtime.
	 * @param {RuntimeRequest} request Request to serve through the CGI runtime.
	 * @returns {Promise<Response|string|undefined>} The generated response or custom not-found result.
	 */
	async request(request)
	{
		const {
			url
			, method = 'GET'
			, get
			, post
			, contentType
		} = await breakoutRequest(request);

		if(globalThis.caches)
		{
			const cache = await caches.open('static-v1');
			const cached = await cache.match(url);

			if(cached)
			{
				const cacheTime = Number(cached.headers.get('x-php-wasm-cache-time'));

				if(this.staticCacheTime > 0 && this.staticCacheTime > Date.now() - cacheTime)
				{
					this.onRequest(request, cached);
					return cached;
				}
			}
		}

		const php = await this.binary;

		await this._beforeRequest();

		let docroot = this.docroot;
		let vHostEntrypoint, vHostPrefix = this.prefix;

		for(const {pathPrefix, directory, entrypoint} of this.vHosts)
		{
			if(pathPrefix === url.pathname.substr(0, pathPrefix.length))
			{
				docroot = directory;
				vHostEntrypoint = entrypoint;
				vHostPrefix = pathPrefix;
				break;
			}
		}

		const rewrite = this.rewrite(url.pathname);
		const rewritePath = typeof rewrite === 'string'
			? rewrite
			: rewrite?.path ?? url.pathname;

		let scriptName, path;

		if(rewrite && typeof rewrite === 'object')
		{
			scriptName = rewrite.scriptName;
			path = docroot + rewrite.path;
		}
		else
		{

			path = joinPaths(docroot, rewritePath.substr((vHostPrefix || this.prefix).length));
			scriptName = path;
		}

		const aboutPath = php.FS.analyzePath(path);

		if(vHostEntrypoint)
		{
			if(!aboutPath.exists || aboutPath.object.isFolder) // Rewrite SCRIPT_NAME to the entrypoint if we don't have a php file...
			{
				scriptName = joinPaths(vHostPrefix, vHostEntrypoint);
			}
			else
			{
				scriptName = joinPaths(vHostPrefix, rewritePath.substr(vHostPrefix.length));
			}
		}

		let originalPath = url.pathname;

		const extension = path.split('.').pop();

		if(extension !== 'php' && extension !== 'phar')
		{
			if(aboutPath.exists && php.FS.isFile(aboutPath.object.mode))
			{
				// Return static file
				const response = new Response(php.FS.readFile(path, {encoding: 'binary'}), {});
				response.headers.append('x-php-wasm-cache-time', String(new Date().getTime()));
				if(extension in this.types)
				{
					response.headers.append('Content-type', this.types[extension]);
				}
				if(globalThis.caches)
				{
					const cache = await caches.open('static-v1');
					cache.put(url, response.clone());
				}
				this.onRequest(request, response);
				return response;
			}
			else if(aboutPath.exists && php.FS.isDir(aboutPath.object.mode) && '/' !== originalPath[ -1 + originalPath.length ])
			{
				originalPath += '/';
			}

			// Rewrite to entrypoint or index.php
			path = joinPaths(docroot, vHostEntrypoint ?? 'index.php');
		}

		// Ensure query parameters are preserved.
		originalPath += url.search;

		if(this.maxRequestAge > 0 && Date.now() - requestTimes.get(request) > this.maxRequestAge)
		{
			const response = new Response('408: Request Timed Out.', { status: 408 });
			this.onRequest(request, response);
			return response;
		}

		// path may have changed, so re-check it:
		if(!php.FS.analyzePath(path).exists)
		{
			const rawResponse = this.notFound
				? this.notFound(request)
				: '404 - Not Found.';

			if(rawResponse)
			{
				return typeof rawResponse === 'object'
					? rawResponse
					: new Response(String(rawResponse), {status: 404});
			}
		}

		let exitCode = -1;

		try
		{
			const requestLock = globalThis.navigator?.locks?.request
				? callback => globalThis.navigator.locks.request('php-wasm-request-lock', callback)
				: callback => callback();

			// We need "return await" otherwise the finally block will run before the lock releases.
			return await requestLock(async () => {
				this.input = ['POST', 'PUT', 'PATCH'].includes(method) ? String(post ?? '').split('') : [];
				this.output = [];
				this.error = [];

				const selfUrl = new URL(String(globalThis.location || request.url));

				putEnv(php, 'PHP_VERSION', this.phpVersion);
				putEnv(php, 'PHP_INI_SCAN_DIR', `/config:/preload:${docroot}`);
				putEnv(php, 'PHPRC', '/php.ini');

				for(const [name, value] of Object.entries(this.env))
				{
					putEnv(php, name, value);
				}

				const protocol = selfUrl.protocol.substr(0, selfUrl.protocol.length - 1);

				putEnv(php, 'SERVER_SOFTWARE', globalThis.navigator ? globalThis.navigator.userAgent : (globalThis.process ? 'Node ' + globalThis.process.version : 'Javascript - Unknown'));
				putEnv(php, 'REQUEST_METHOD', method);
				putEnv(php, 'REMOTE_ADDR', '127.0.0.1');
				putEnv(php, 'HTTP_HOST', selfUrl.host);
				putEnv(php, 'REQUEST_SCHEME', protocol);
				putEnv(php, 'HTTPS', protocol === 'https' ? 'on' : 'off');

				putEnv(php, 'DOCUMENT_ROOT', docroot);
				putEnv(php, 'REQUEST_URI', originalPath);
				putEnv(php, 'SCRIPT_NAME', scriptName);
				putEnv(php, 'SCRIPT_FILENAME', path);
				putEnv(php, 'PATH_TRANSLATED', path);

				putEnv(php, 'QUERY_STRING', get);
				putEnv(php, 'HTTP_COOKIE', this.cookieJar.toEnv());
				putEnv(php, 'REDIRECT_STATUS', '200');
				putEnv(php, 'CONTENT_TYPE', contentType);
				putEnv(php, 'CONTENT_LENGTH', String(this.input.length));

				this.output = [];

				exitCode = Number(await php.ccall(
					'main'
					, 'number'
					, ['number', 'string']
					, []
					, {async: true}
				));

				++this.count;

				const parsedResponse = parseResponse(this.output);

				let status = 200;

				if(parsedResponse.headers.has('Status'))
				{
					status = Number(parsedResponse.headers.get('Status').substr(0, 3));
				}

				for(const rawCookie of parsedResponse.headers.getSetCookie())
				{
					this.cookieJar.store(rawCookie);
				}

				php.FS.writeFile('/config/.cookies', this.cookieJar.dump());

				const headers = new Headers(parsedResponse.headers);

				if(!headers.has('Content-type'))
				{
					if(extension in this.types)
					{
						headers.set('Content-type', this.types[extension]);
					}
					else
					{
						headers.set('Content-type', 'text/html; charset=utf-8');
					}
				}

				if(parsedResponse.headers.has('Location'))
				{
					headers.set('Location', parsedResponse.headers.get('Location'));
				}

				const response = new Response(parsedResponse.body || '', {status, headers});

				this.onRequest(request, response);

				return response;
			});
		}
		catch(error)
		{
			console.error(error);

			const response = new Response(
				`500: Internal Server Error.\n`
					+ `=`.repeat(80) + `\n\n`
					+ `Stacktrace:\n${error.stack}\n`
					+ `=`.repeat(80) + `\n\n`
					+ `STDERR:\n${new TextDecoder().decode(new Uint8Array(this.error).buffer)}\n`
					+ `=`.repeat(80) + `\n\n`
					+ `STDOUT:\n${new TextDecoder().decode(new Uint8Array(this.output).buffer)}\n`
					+ `=`.repeat(80) + `\n\n`
				, { status: 500 }
			);

			this.onRequest(request, response);

			this.refresh();

			return response;
		}
		finally
		{
			if(exitCode === 0)
			{
				this._afterRequest();
			}
			else
			{
				console.warn(new TextDecoder().decode(new Uint8Array(this.output).buffer));
				console.error(new TextDecoder().decode(new Uint8Array(this.error).buffer));

				this.refresh();
			}
		}
	}

	/**
	 * Inspects a path in the CGI virtual filesystem.
	 * @param {string} path Filesystem path to inspect.
	 * @returns {Promise<PhpRuntimeValue>} Filesystem analysis details for the path.
	 */
	analyzePath(path)
	{
		return this._enqueue(fsOps.analyzePath, [this.binary, path]);
	}

	/**
	 * Lists a directory in the CGI virtual filesystem.
	 * @param {string} path Directory path to list.
	 * @returns {Promise<PhpRuntimeValue>} Directory entries for the path.
	 */
	readdir(path)
	{
		return this._enqueue(fsOps.readdir, [this.binary, path]);
	}

	/**
	 * Reads a file from the CGI virtual filesystem.
	 * @param {string} path File path to read.
	 * @param {object} options Read options forwarded to Emscripten FS.
	 * @returns {Promise<PhpRuntimeValue>} File contents for the requested path.
	 */
	readFile(path, options)
	{
		return this._enqueue(fsOps.readFile, [this.binary, path, options]);
	}

	/**
	 * Returns file metadata for a CGI virtual filesystem path.
	 * @param {string} path Filesystem path to stat.
	 * @returns {Promise<PhpRuntimeValue>} File metadata for the path.
	 */
	stat(path)
	{
		return this._enqueue(fsOps.stat, [this.binary, path]);
	}

	/**
	 * Creates a directory in the CGI virtual filesystem.
	 * @param {string} path Directory path to create.
	 * @returns {Promise<PhpRuntimeValue>} Metadata for the created directory.
	 */
	mkdir(path)
	{
		return this._enqueue(fsOps.mkdir, [this.binary, path]);
	}

	/**
	 * Removes a directory from the CGI virtual filesystem.
	 * @param {string} path Directory path to remove.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the directory has been removed.
	 */
	rmdir(path)
	{
		return this._enqueue(fsOps.rmdir, [this.binary, path]);
	}

	/**
	 * Renames a path in the CGI virtual filesystem.
	 * @param {string} path Existing filesystem path.
	 * @param {string} newPath Destination filesystem path.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the path has been renamed.
	 */
	rename(path, newPath)
	{
		return this._enqueue(fsOps.rename, [this.binary, path, newPath]);
	}

	/**
	 * Writes data to a file in the CGI virtual filesystem.
	 * @param {string} path File path to write.
	 * @param {string|Uint8Array} data Data to persist.
	 * @param {object} options Write options forwarded to Emscripten FS.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the file has been written.
	 */
	writeFile(path, data, options)
	{
		return this._enqueue(fsOps.writeFile, [this.binary, path, data, options]);
	}

	/**
	 * Deletes a file from the CGI virtual filesystem.
	 * @param {string} path File path to remove.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the file has been removed.
	 */
	unlink(path)
	{
		return this._enqueue(fsOps.unlink, [this.binary, path]);
	}

	/**
	 * Sets an environment variable inside the CGI runtime.
	 * @param {string} name Environment variable name.
	 * @param {string} value Environment variable value.
	 * @returns {Promise<number>} Native return code from the underlying `putenv` call.
	 */
	async putEnv(name, value)
	{
		return (await this.binary).ccall('wasm_sapi_cgi_putenv', 'number', ['string', 'string'], [name, value]);
	}

	/**
	 * Returns the current CGI runtime settings.
	 * @returns {Promise<object>} Current runtime settings exposed over the control API.
	 */
	async getSettings()
	{
		return {
			docroot: this.docroot
			, maxRequestAge: this.maxRequestAge
			, staticCacheTime: this.staticCacheTime
			, dynamicCacheTime: this.dynamicCacheTime
			, vHosts: this.vHosts
		};
	}

	/**
	 * Merges new settings into the CGI runtime configuration.
	 * @param {object} options Settings to merge into the current runtime configuration.
	 * @param {string} options.docroot Updated document root.
	 * @param {number} options.maxRequestAge Updated request timeout threshold in milliseconds.
	 * @param {number} options.staticCacheTime Updated static cache lifetime in milliseconds.
	 * @param {number} options.dynamicCacheTime Updated dynamic cache lifetime in milliseconds.
	 * @param {PhpVhostList} options.vHosts Updated virtual host definitions.
	 */
	setSettings({docroot, maxRequestAge, staticCacheTime, dynamicCacheTime, vHosts})
	{
		this.docroot = docroot ?? this.docroot;
		this.maxRequestAge = maxRequestAge ?? this.maxRequestAge;
		this.staticCacheTime = staticCacheTime ?? this.staticCacheTime;
		this.dynamicCacheTime = dynamicCacheTime ?? this.dynamicCacheTime;
		this.vHosts = vHosts ?? this.vHosts;
	}

	/**
	 * Returns a copy of the configured CGI environment variables.
	 * @returns {Promise<object>} A shallow copy of the configured environment variables.
	 */
	async getEnvs()
	{
		return {...this.env};
	}

	/**
	 * Replaces the CGI runtime environment variable map.
	 * @param {{[key: string]: string}} env Environment variables to replace on the runtime.
	 */
	setEnvs(env)
	{
		for(const key of Object.keys(this.env))
		{
			this.env[key] = undefined;
		}

		Object.assign(this.env, env);
	}

	/**
	 * Persists the current CGI settings and environment to disk.
	 * @returns {Promise<void>} Resolves after the current runtime settings are persisted.
	 */
	async storeInit()
	{
		const settings = await this.getSettings();
		const env = await this.getEnvs();
		await this.writeFile(
			'/config/init.json'
			, JSON.stringify({settings, env}, null, 4)
			, {encoding: 'utf8'}
		);
	}

	/**
	 * Loads persisted CGI settings and environment from disk.
	 * @param {object} binary PHP module instance whose virtual FS may contain persisted init data.
	 */
	loadInit(binary)
	{
		const initPath = '/config/init.json';
		const check = binary.FS.analyzePath(initPath);

		if(!check.exists)
		{
			return;
		}

		const initJson = binary.FS.readFile(initPath, {encoding: 'utf8'});
		const init = JSON.parse(initJson || '{}');
		const {settings, env} = init;

		this.setSettings(settings);
		this.setEnvs(env);
	}
}
