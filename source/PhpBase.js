import { OutputBuffer } from './OutputBuffer';
import { _Event } from './_Event';
import { fsOps } from './fsOps';
import { resolveDependencies } from './resolveDependencies';

const importMeta = import.meta;

const STR = 'string';
const NUM = 'number';

/**
 * Base PHP runtime wrapper shared by the environment-specific adapters.
 */
export class PhpBase extends EventTarget
{
	/** @type {Array<[PhpQueuedCallback, PhpQueueParams, PhpQueueResolve, PhpQueueReject]>} */
	queue;
	/** @type {(event?: Event) => void} */
	onerror;
	/** @type {(event?: Event) => void} */
	onoutput;
	/** @type {(event?: Event) => void} */
	onready;
	/** @type {TextEncoder} */
	encoder;
	/** @type {{stdin: number[], stdout: OutputBuffer, stderr: OutputBuffer}} */
	buffers;
	/** @type {boolean} */
	autoTransaction;
	/** @type {boolean|Promise<void>} */
	transactionStarted;
	/** @type {string|undefined} */
	phpVersion;
	/** @type {string|undefined} */
	phpVariant;
	/** @type {{[key: string]: PhpSharedValue}} */
	shared;
	/** @type {PhpRuntimeArgs} */
	phpArgs;
	/** @type {number} */
	valueIndex;
	/** @type {Promise<object>} */
	binary;

	/**
	 * Creates a PHP runtime wrapper for a specific module loader and SAPI.
	 * @param {Promise<{default: new (args: object) => object}>} phpBinLoader Deferred PHP module loader.
	 * @param {PhpRuntimeArgs} args Runtime configuration for the PHP instance.
	 * @param {string} sapi SAPI identifier to initialize inside the module.
	 */
	constructor(phpBinLoader, args = {}, sapi = 'embed')
	{
		super();

		this.queue  = [];

		this.onerror  = function () {};
		this.onoutput = function () {};
		this.onready  = function () {};

		Object.defineProperty(this, 'encoder', {value: new TextEncoder()});
		Object.defineProperty(this, 'buffers', {value: {
			stdin: []
			, stdout: new OutputBuffer(this, 'output', -1)
			, stderr: new OutputBuffer(this, 'error',  -1)
		} });

		Object.freeze(this.buffers);

		this.autoTransaction = ('autoTransaction' in args) ? args.autoTransaction : true;
		this.transactionStarted = false;

		this.phpVersion = args.version;
		this.phpVariant = args.variant;

		this.shared = args.shared = ('shared' in args) ? args.shared : {};

		this.phpArgs = args;

		const defaults = {
			stdin:  () => this.buffers.stdin.shift() ?? null
			, stdout: byte => this.buffers.stdout.push(byte)
			, stderr: byte => this.buffers.stderr.push(byte)

			, postRun:  () => {
				const event = new _Event('ready');
				this.onready(event);
				this.dispatchEvent(event);
			}
		};

		const fixed = { onRefresh: new Set };
		const phpSettings = globalThis.phpSettings ?? {};
		const userLocateFile = args.locateFile || (() => undefined);

		const files = args.files || [];

		const {files: sharedLibFiles, libs: sharedlibs, urlLibs: sharedLibUrls} = resolveDependencies(args.sharedLibs, this);
		const {files: dynamicLibFiles, libs: dynamiclibs, urlLibs: dyamicLibUrls} = resolveDependencies(args.dynamicLibs, this);

		args.locateFile = (path, directory) => {
			args.debug && console.error('Loading %s',  path);
			let located = userLocateFile(path, directory);
			if(located !== undefined)
			{
				return located;
			}
			if(sharedLibUrls[path])
			{
				return sharedLibUrls[path];
			}
			if(dyamicLibUrls[path])
			{
				return dyamicLibUrls[path];
			}

			// Suppress attempt to load libxml when
			// it hasn't been provided in sharedLibs
			if(path === 'libxml2.so')
			{
				return 'data:,';
			}
		};

		this.valueIndex = 0;

		const phpArgs = Object.assign({}, defaults, phpSettings, args, fixed);

		this.binary = phpBinLoader.then(({default: PHP}) => new PHP(phpArgs)).then(async php => {
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

			const allFiles = files.concat(sharedLibFiles, dynamicLibFiles);

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

			await Promise.all(allFiles.map(
				fileDef => new Promise(accept => php.FS.createPreloadedFile(
					fileDef.parent,
					fileDef.name,
					fileDef.url instanceof URL ? fileDef.url.href : fileDef.url,
					true,
					false,
					accept,
				))
			));

			const iniLines = sharedlibs.map(lib => {
				if(typeof lib === 'string' || lib instanceof URL)
				{
					return `extension=${lib}`;
				}
				else if(typeof lib === 'object' && lib.ini)
				{
					return `extension=${lib.name ?? String(lib.url).split('/').pop()}`;
				}
			});

			args.ini && iniLines.push(args.ini.replace(/\n\s+/g, '\n'));

			php.FS.writeFile('/php.ini', iniLines.join("\n") + "\n", {encoding: 'utf8'});

			await php.ccall(
				'pib_init'
				, NUM
				, [STR]
				, [sapi]
				, {async: true}
			);

			return php;
		});
	}

	/**
	 * Encodes a text string and pushes it into STDIN.
	 * @param {string} byteString Input text to encode and queue for STDIN.
	 */
	inputString(byteString)
	{
		this.input(this.encoder.encode(byteString));
	}

	/**
	 * Queues raw input bytes for the PHP process.
	 * @param {Iterable<number>} items Encoded input bytes to queue for STDIN.
	 */
	input(items)
	{
		this.buffers.stdin.push(...items);
	}

	/**
	 * Flushes buffered STDOUT and STDERR data.
	 */
	flush()
	{
		this.buffers.stdout.flush();
		this.buffers.stderr.flush();
	}

	/**
	 * Tokenizes a PHP source string in the runtime.
	 * @param {string} phpCode PHP source to tokenize.
	 * @returns {Promise<string>} Serialized token data from the PHP runtime.
	 */
	tokenize(phpCode)
	{
		return this.binary.then(php => php.ccall(
			'pib_tokenize'
			, STR
			, [STR]
			, [phpCode]
		));
	}

	/**
	 * Starts a filesystem transaction when the environment supports it.
	 * @returns {Promise<void>} Resolves when a transaction has started.
	 */
	startTransaction()
	{
		return Promise.resolve();
	}

	/**
	 * Commits a filesystem transaction when the environment supports it.
	 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
	 * @returns {Promise<void>} Resolves when the transaction has been committed.
	 */
	commitTransaction(readOnly = false)
	{
		return Promise.resolve();
	}

	/**
	 * Schedules an async operation on the runtime queue.
	 * @param {PhpQueuedCallback} callback Async operation to queue.
	 * @param {PhpQueueParams} params Arguments passed to the queued callback.
	 * @param {boolean} readOnly Indicates whether the queued operation mutates the filesystem.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the queued callback result.
	 */
	async _enqueue(callback, params = [], readOnly = false)
	{
		let accept, reject;

		const coordinator = new Promise((a,r) => [accept, reject] = [a, r]);

		const _accept = result => accept(result);
		const _reject = reason => reject(reason);

		this.queue.push([callback, params, _accept, _reject]);

		if(!this.queue.length)
		{
			return;
		}

		await (this.autoTransaction && !readOnly) ? this.startTransaction() : Promise.resolve();

		while(this.queue.length)
		{
			const [callback, params, accept, reject] = this.queue.shift();
			await callback(...params).then(accept).catch(reject);
		}

		await this.autoTransaction ? this.commitTransaction(readOnly) : Promise.resolve();

		return coordinator;
	}

	/**
	 * Queues PHP code for execution through `pib_run`.
	 * @param {string|string[]} phpCode PHP source code to execute.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the execution result.
	 */
	run(phpCode)
	{
		return this._enqueue(
			/**
			 * Executes queued PHP source.
			 * @param {string} phpCode PHP source code queued for execution.
			 * @returns {Promise<PhpRuntimeValue>} Resolves with the PHP execution result.
			 */
			phpCode => this._run(phpCode),
			[phpCode]
		);
	}

	/**
	 * Executes PHP code immediately through `pib_run`.
	 * @param {string|string[]} phpCode PHP source code to execute immediately.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the execution result.
	 */
	_run(phpCode)
	{
		return this.binary.then(php => {
			return php.ccall(
				'pib_run'
				, NUM
				, [STR]
				, [`?>${phpCode}`]
			);
		})
		.finally(() => this.flush());
	}

	/**
	 * Queues PHP code for execution through `pib_exec`.
	 * @param {string|string[]} phpCode PHP source code to evaluate and capture output from.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the execution result.
	 */
	exec(phpCode)
	{
		return this._enqueue(
			/**
			 * Executes queued PHP source and captures the result.
			 * @param {string} phpCode PHP source code queued for evaluation.
			 * @returns {Promise<PhpRuntimeValue>} Resolves with the PHP evaluation result.
			 */
			phpCode => this._exec(phpCode),
			[phpCode]
		);
	}

	/**
	 * Executes PHP code immediately through `pib_exec`.
	 * @param {string|string[]} phpCode PHP source code to evaluate immediately.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the execution result.
	 */
	async _exec(phpCode)
	{
		const call = (await this.binary).ccall(
			'pib_exec'
			, STR
			, [STR]
			, [phpCode]
			, {async: true}
		);

		return call.finally(() => this.flush());
	}

	/**
	 * Evaluates an interpolated PHP expression and returns its value.
	 * @param {string[]} fragments Template literal string fragments.
	 * @param {...(object|string|number|boolean|null)} values Values to interpolate into the PHP expression.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the decoded PHP expression result.
	 */
	async x(fragments, ...values)
	{
		const names = [];
		const phpModule = await this.binary;

		if(phpModule.hasVrzno)
		{
			for(const value of values)
			{
				const name = `___value__${this.valueIndex++}`;
				this.shared[name] = value;
				names.push(name);
			}

			let code = '';

			fragments = [...fragments];

			while(fragments.length || names.length)
			{
				if(fragments.length) code += fragments.shift();
				if(names.length) code += `(vrzno_shared('${names.shift()}'))`;
			}

			code = `vrzno_zval( ${code} );`;

			return phpModule.zvalToJS(await this.exec(code));
		}
		else
		{
			const encoded = values.map(value => JSON.stringify(value));

			fragments = [...fragments];

			let code = '';

			while(fragments.length || names.length)
			{
				if(fragments.length)
					code += fragments.shift();

				if(encoded.length)
				{
					code += `(json_decode('${encoded.shift()}'))`;
				}
			}

			return this.exec(code);
		}
	}

	/**
	 * Executes an interpolated PHP script without decoding the result.
	 * @param {string[]} fragments Template literal string fragments.
	 * @param {...(object|string|number|boolean|null)} values Values to interpolate into the PHP script.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the script execution result.
	 */
	async r(fragments, ...values)
	{
		const names = [];
		const phpModule = await this.binary;

		if(phpModule.hasVrzno)
		{
			for(const value of values)
			{
				const name = `___value__${this.valueIndex++}`;
				this.shared[name] = value;
				names.push(name);
			}

			let code = '';

			fragments = [...fragments];

			while(fragments.length || names.length)
			{
				if(fragments.length)
					code += fragments.shift();

				if(names.length)
				{
					code += `(vrzno_shared('${names.shift()}'))`;
				}
			}

			return this.run(code);
		}
		else
		{
			const encoded = values.map(value => JSON.stringify(value));

			fragments = [...fragments];

			let code = '';

			while(fragments.length || names.length)
			{
				if(fragments.length)
					code += fragments.shift();

				if(encoded.length)
				{
					code += `(json_decode('${encoded.shift()}'))`;
				}
			}

			return this.run(code);
		}
	}

	/**
	 * Recreates the underlying PHP module instance.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the PHP runtime has been refreshed.
	 */
	async refresh()
	{
		const php = await this.binary;

		for(const callback of php.onRefresh)
		{
			callback();
		}

		Object.keys(this.shared).forEach(key => delete this.shared[key]);

		return php.ccall(
			'pib_refresh'
			, NUM
			, []
			, []
			, {async: true}
		);
	}

	/**
	 * Inspects a path in the virtual filesystem.
	 * @param {string} path Filesystem path to inspect.
	 * @returns {Promise<PhpRuntimeValue>} Filesystem analysis details for the path.
	 */
	analyzePath(path)
	{
		return this._enqueue(fsOps.analyzePath, [this.binary, path]);
	}

	/**
	 * Lists a directory in the virtual filesystem.
	 * @param {string} path Directory path to list.
	 * @returns {Promise<PhpRuntimeValue>} Directory entries for the path.
	 */
	readdir(path)
	{
		return this._enqueue(fsOps.readdir, [this.binary, path]);
	}

	/**
	 * Reads a file from the virtual filesystem.
	 * @param {string} path File path to read.
	 * @param {object} options Read options forwarded to Emscripten FS.
	 * @returns {Promise<PhpRuntimeValue>} File contents for the requested path.
	 */
	readFile(path, options)
	{
		return this._enqueue(fsOps.readFile, [this.binary, path, options]);
	}

	/**
	 * Returns file metadata for a virtual filesystem path.
	 * @param {string} path Filesystem path to stat.
	 * @returns {Promise<PhpRuntimeValue>} File metadata for the path.
	 */
	stat(path)
	{
		return this._enqueue(fsOps.stat, [this.binary, path]);
	}

	/**
	 * Creates a directory in the virtual filesystem.
	 * @param {string} path Directory path to create.
	 * @returns {Promise<PhpRuntimeValue>} Metadata for the created directory.
	 */
	mkdir(path)
	{
		return this._enqueue(fsOps.mkdir, [this.binary, path]);
	}

	/**
	 * Removes a directory from the virtual filesystem.
	 * @param {string} path Directory path to remove.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the directory has been removed.
	 */
	rmdir(path)
	{
		return this._enqueue(fsOps.rmdir, [this.binary, path]);
	}

	/**
	 * Renames a virtual filesystem path.
	 * @param {string} path Existing filesystem path.
	 * @param {string} newPath Destination filesystem path.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the path has been renamed.
	 */
	rename(path, newPath)
	{
		return this._enqueue(fsOps.rename, [this.binary, path, newPath]);
	}

	/**
	 * Writes a file into the virtual filesystem.
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
	 * Deletes a file from the virtual filesystem.
	 * @param {string} path File path to remove.
	 * @returns {Promise<PhpRuntimeValue>} Resolves when the file has been removed.
	 */
	unlink(path)
	{
		return this._enqueue(fsOps.unlink, [this.binary, path]);
	}
}
