import { phpVersion } from "./config";
import { phpVersionFull } from "./config";
import { parseResponse } from './parseResponse';
import { breakoutRequest } from './breakoutRequest';
import { fsOps } from './fsOps';
import { resolveDependencies } from './resolveDependencies';

/**
 * An object representing a dynamically loaded data file.
 * @typedef {string|object} FileDef
 * @property {string} url
 * @property {string} path
 * @property {string} parent
 */

/**
 * A string or object representing a dynamically loaded shared library.
 * @typedef {string|object} LibDef
 * @property {string} name
 * @property {string} url
 * @property {boolean} ini
 * @property {function():libDef[]} getLibs
 * @property {function():fileDef[]} getFiles
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
	noTrailingSlash(args[0]), // Don't strip the leading slash on the first segment...
	...args.slice(1).map( a => noLeadingSlash(noTrailingSlash(a)) )
].join('/');

export class PhpCgiBase
{
	docroot    = null;
	prefix     = '/php-wasm';
	exclude    = [];
	rewrite    = path => path;
	cookies    = null;
	types      = {};
	onRequest  = () => {};
	notFound   = () => {};
	sharedLibs = [];
	files      = [];
	phpArgs    = {};

	maxRequestAge    = 0;
	staticCacheTime  = 60_000;
	dynamicCacheTime = 0;
	vHosts = [];

	php        = null;
	input      = [];
	output     = [];
	error      = [];
	count      = 0;

	queue = [];

	/**
	 * Creates a new PHP instance (async)
	 * @param {*} PHP
	 * @param {string} options.prefix The URL path prefix to look for when routing to PHP.
	 * @param {string} options.docroot The internal directory to use as the public document root.
	 * @param {string[]} options.exclude Array of URL prefixes to exclude from routing to PHP.
	 * @param {Array.<{pathPrefix: string, directory: string, entrypoint: string}>} options.vHosts A list of prefixes, directories and entrypoints to serve multiple PHP applications by URL prefix.
	 * @param {string} options.entrypoint Path to PHP file under docroot to serve as an entrypoint
	 * @param {function(string):string} options.rewrite Function to rewrite URLs
	 * @param {object<string, string>} options.types Mapping of file extensions to mime types to populate the `Content-type` header.
	 * @param {function()} options.onRequest Function to be executed on each request.
	 * @param {function(Request):Response|string} options.notFound Function to handle 404s.
	 * @param {LibDef[]} options.sharedLibs Dynamically load shared libraries with LibDefs
	 * @param {FileDef[]} options.files Dynamically load files with FileDefs
	 * @param {boolean} options.autoTransaction Automatically handle FS transactions on each request
	 * @param {number} options.maxRequestAge Oldest request to process (ms)
	 * @param {number} options.staticCacheTime Static cache time (ms)
	 * @param {number} options.dynamicCacheTime Dynamic cache time (ms)
	 * @param {object<string, string}>} options.env Mapping of environment variable names to values to set inside the server.
	 */
	constructor(PHP, {docroot, prefix, exclude, rewrite, entrypoint, cookies, types, onRequest, notFound, sharedLibs, actions, files, ...args} = {})
	{
		this.PHP        = PHP;
		this.docroot    = docroot    || this.docroot;
		this.prefix     = prefix     || this.prefix;
		this.exclude    = exclude    || this.exclude;
		this.rewrite    = rewrite    || this.rewrite;
		this.entrypoint = entrypoint || this.entrypoint;
		this.cookies    = cookies    || new Map;
		this.types      = types      || this.types;
		this.onRequest  = onRequest  || this.onRequest;
		this.notFound   = notFound   || this.notFound;
		this.sharedLibs = sharedLibs || this.sharedLibs;
		this.files      = files      || this.files;
		this.extraActions = actions  || {};

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

	handleInstallEvent(event)
	{
		return event.waitUntil(self.skipWaiting());
	}

	handleActivateEvent(event)
	{
		return event.waitUntil(self.clients.claim());
	}

	async handleMessageEvent(event)
	{
		const { data, source } = event;
		const { action, token, params = [] } = data;

		const actions = [
			'analyzePath',
			'readdir',
			'readFile',
			'stat',
			'mkdir',
			'rmdir',
			'writeFile',
			'rename',
			'unlink',
			'putEnv',
			'refresh',
			'getSettings',
			'setSettings',
			'getEnvs',
			'setEnvs',
			'storeInit',
		];

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

	handleFetchEvent(event)
	{
		const url = new URL(event.request.url);
		const prefix = this.prefix;

		const {files, urlLibs} = resolveDependencies(this.sharedLibs, this);

		let isWhitelisted = false;
		let isBlacklisted = false;

		if(globalThis.location)
		{
			const staticUrls = [self.location.pathname, ...files.map(file => file.url),...Object.values(urlLibs)]
			.map(url => new URL(url, self.location.origin))
			.filter(url => url.origin === self.location.origin)
			.map(url => url.pathname);

			isWhitelisted = url.pathname.substr(0, prefix.length) === prefix && url.hostname === self.location.hostname;
			isBlacklisted = url.pathname.match(/\.wasm$/i)
			|| staticUrls.includes(url.pathname)
			|| (this.exclude.findIndex(exclude => url.pathname.substr(0, exclude.length) === exclude) > -1)
			|| false;
		}
		else
		{
			isWhitelisted = url.pathname.substr(0, prefix.length) === prefix;
			isBlacklisted = url.pathname.match(/\.wasm$/i)
			|| (this.exclude.findIndex(exclude => url.pathname.substr(0, exclude.length) === exclude) > -1)
			|| false;
		}

		if(isWhitelisted && !isBlacklisted)
		{
			requestTimes.set(event.request, Date.now());
			const response = this.request(event.request);
			return event.respondWith(response);
		}
	}

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

	refresh()
	{
		const {files, libs, urlLibs} = resolveDependencies(this.sharedLibs, this);

		const userLocateFile = this.phpArgs.locateFile || (() => undefined);

		const locateFile = (path, directory) => {
			let located = userLocateFile(path, directory);
			if(located !== undefined)
			{
				return located;
			}

			if(urlLibs[path])
			{
				if(urlLibs[path].protocol === 'file:')
				{
					return urlLibs[path].pathname;
				}

				return String(urlLibs[path]);
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

		return this.binary = new this.PHP(phpArgs).then(async php => {
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

			await Promise.all(this.files.concat(files).map(fileDef => php.FS.createPreloadedFile(
				fileDef.parent, fileDef.name, userLocateFile(fileDef.url) ?? fileDef.url, true, false
			)));

			const iniLines = libs.map(lib => {
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

			await this.loadInit(php);

			return php;
		});
	}

	async _beforeRequest()
	{}

	async _afterRequest()
	{}

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

		let scriptName, path;

		if(typeof rewrite === 'object')
		{
			scriptName = rewrite.scriptName;
			path = docroot + rewrite.path;
		}
		else
		{

			path = joinPaths(docroot, rewrite.substr((vHostPrefix || this.prefix).length));
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
				scriptName = joinPaths(vHostPrefix, rewrite.substr(vHostPrefix.length));
			}
		}

		let originalPath = url.pathname;

		const extension = path.split('.').pop();

		if(extension !== 'php' && extension !== 'phar')
		{
			if(aboutPath.exists && php.FS.isFile(aboutPath.object.mode))
			{
				// Return static file
				const response = new Response(php.FS.readFile(path, { encoding: 'binary', url }), {});
				response.headers.append('x-php-wasm-cache-time', new Date().getTime());
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
				originalPath += '/'
			}

			// Rewrite to index
			path = joinPaths(docroot, 'index.php');
		}

		// Ensure query parameters are preserved.
		originalPath += url.search

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
				return rawResponse instanceof Response
					? rawResponse
					: new Response(rawResponse, {status: 404});
			}
		}

		this.input = ['POST', 'PUT', 'PATCH'].includes(method) ? post.split('') : [];
		this.output = [];
		this.error = [];

		const selfUrl = new URL(globalThis.location || request.url);

		putEnv(php, 'PHP_VERSION', phpVersion);
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
		putEnv(php, 'HTTP_COOKIE', [...this.cookies.entries()].map(e => `${e[0]}=${e[1]}`).join(';') );
		putEnv(php, 'REDIRECT_STATUS', '200');
		putEnv(php, 'CONTENT_TYPE', contentType);
		putEnv(php, 'CONTENT_LENGTH', String(this.input.length));

		let exitCode = -1;

		try
		{
			exitCode = await php.ccall(
				'main'
				, 'number'
				, ['number', 'string']
				, []
				, {async: true}
			);
		}
		catch (error)
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

		++this.count;

		const parsedResponse = parseResponse(this.output);

		let status = 200;

		for(const [name, value] of Object.entries(parsedResponse.headers))
		{
			if(name === 'Status')
			{
				status = value.substr(0, 3);
			}
		}

		if(parsedResponse.headers['Set-Cookie'])
		{
			const raw = parsedResponse.headers['Set-Cookie'];
			const semi  = raw.indexOf(';');
			const equal = raw.indexOf('=');
			const key   = raw.substr(0, equal);
			const value = raw.substr(1 + equal, -1 + semi - equal);

			this.cookies.set(key, value,);
		}

		const headers = {...parsedResponse.headers};

		// delete headers['Set-Cookie'];

		if(extension in this.types)
		{
			// headers["Content-type"] = this.types[extension];
		}
		else
		{
			headers["Content-type"] = headers["Content-type"] ?? 'text/html; charset=utf-8';
		}

		if(parsedResponse.headers.Location)
		{
			headers.Location = parsedResponse.headers.Location;
		}

		const response = new Response(parsedResponse.body || '', { headers, status, url });

		this.onRequest(request, response);

		return response;
	}

	analyzePath(path)
	{
		return this._enqueue(fsOps.analyzePath, [this.binary, path]);
	}

	readdir(path)
	{
		return this._enqueue(fsOps.readdir, [this.binary, path]);
	}

	readFile(path, options)
	{
		return this._enqueue(fsOps.readFile, [this.binary, path, options]);
	}

	stat(path)
	{
		return this._enqueue(fsOps.stat, [this.binary, path]);
	}

	mkdir(path)
	{
		return this._enqueue(fsOps.mkdir, [this.binary, path]);
	}

	rmdir(path)
	{
		return this._enqueue(fsOps.rmdir, [this.binary, path]);
	}

	rename(path, newPath)
	{
		return this._enqueue(fsOps.rename, [this.binary, path, newPath]);
	}

	writeFile(path, data, options)
	{
		return this._enqueue(fsOps.writeFile, [this.binary, path, data, options]);
	}

	unlink(path)
	{
		return this._enqueue(fsOps.unlink, [this.binary, path]);
	}

	async putEnv(name, value)
	{
		return (await this.binary).ccall('wasm_sapi_cgi_putenv', 'number', ['string', 'string'], [name, value]);
	}

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

	setSettings({docroot, maxRequestAge, staticCacheTime, dynamicCacheTime, vHosts})
	{
		this.docroot = docroot ?? this.docroot;
		this.maxRequestAge = maxRequestAge ?? this.maxRequestAge;
		this.staticCacheTime = staticCacheTime ?? this.staticCacheTime;
		this.dynamicCacheTime = dynamicCacheTime ?? this.dynamicCacheTime;
		this.vHosts = vHosts ?? this.vHosts;
	}

	async getEnvs()
	{
		return {...this.env};
	}

	setEnvs(env)
	{
		for(const key of Object.keys(this.env))
		{
			this.env[key] = undefined;
		}

		Object.assign(this.env, env);
	}

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

	async loadInit(binary)
	{
		const initPath = '/config/init.json';
		const check = await fsOps.analyzePath(binary, initPath);

		if(!check.exists)
		{
			return;
		}

		const initJson = await fsOps.readFile(binary, initPath, {encoding: 'utf8'});
		const init = JSON.parse(initJson || '{}');
		const {settings, env} = init;

		this.setSettings(settings);
		this.setEnvs(env);
	}
}

PhpCgiBase.phpVersion = phpVersion;
PhpCgiBase.phpVersionFull = phpVersionFull;
