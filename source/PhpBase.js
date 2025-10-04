import { phpVersion } from './config';
import { phpVersionFull } from './config';

import { OutputBuffer } from './OutputBuffer';
import { _Event } from './_Event';
import { fsOps } from './fsOps';
import { resolveDependencies } from './resolveDependencies';

const STR = 'string';
const NUM = 'number';

export class PhpBase extends EventTarget
{
	constructor(phpBinLoader, args = {}, sapi = 'embed')
	{
		super();

		this.queue  = [];

		this.onerror  = function () {};
		this.onoutput = function () {};
		this.onready  = function () {};

		Object.defineProperty(this, 'encoder', {value: new TextEncoder()});
		Object.defineProperty(this, 'buffers', {value: {
			stdin: [],
			stdout: new OutputBuffer(this, 'output', -1),
			stderr: new OutputBuffer(this, 'error',  -1),
		} });

		Object.freeze(this.buffers);

		this.autoTransaction = ('autoTransaction' in args) ? args.autoTransaction : true;
		this.transactionStarted = false;

		this.shared = args.shared = ('shared' in args) ? args.shared : {};

		this.phpArgs = args;

		const defaults = {
			stdin:  () => this.buffers.stdin.shift() ?? null,
			stdout: byte => this.buffers.stdout.push(byte),
			stderr: byte => this.buffers.stderr.push(byte),

			postRun:  () => {
				const event = new _Event('ready');
				this.onready(event);
				this.dispatchEvent(event);
			},
		};

		const fixed = { onRefresh: new Set };
		const phpSettings = globalThis.phpSettings ?? {};
		const userLocateFile = args.locateFile || (() => undefined);

		const files = args.files || [];

		const {files: extraFiles, libs, urlLibs} = resolveDependencies(args.sharedLibs, this);

		args.locateFile = (path, directory) => {
			console.log({path, directory});
			let located = userLocateFile(path, directory);
			console.log({located}, urlLibs[path]);
			if(located !== undefined)
			{
				return located;
			}
			if(urlLibs[path])
			{
				return urlLibs[path];
			}
		};

		this.valueIndex = 0;

		const phpArgs = Object.assign({}, defaults, phpSettings, args, fixed);

		this.binary = phpBinLoader.then(({default: PHP}) => new PHP(phpArgs)).then(async php => {
			php.ccall(
				'pib_storage_init'
				, NUM
				, []
				, []
			);

			if(!php.FS.analyzePath('/preload').exists)
			{
				php.FS.mkdir('/preload');
			}

			await Promise.all(files.concat(extraFiles).map(
				fileDef => new Promise(accept => php.FS.createPreloadedFile(
					fileDef.parent,
					fileDef.name,
					fileDef.url,
					true,
					false,
					accept,
				))
			));

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

	inputString(byteString)
	{
		this.input(this.encoder.encode(byteString));
	}

	input(items)
	{
		this.buffers.stdin.push(...items);
	}

	flush()
	{
		this.buffers.stdout.flush();
		this.buffers.stderr.flush();
	}

	tokenize(phpCode)
	{
		return this.binary.then(php => php.ccall(
			'pib_tokenize'
			, STR
			, [STR]
			, [phpCode]
		));
	}

	startTransaction()
	{
		return Promise.resolve();
	}

	commitTransaction(readOnly = false)
	{
		return Promise.resolve();
	}

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

	run(phpCode)
	{
		return this._enqueue(phpCode => this._run(phpCode), [phpCode]);
	}

	async _run(phpCode)
	{
		const call = (await this.binary).ccall(
			'pib_run'
			, NUM
			, [STR]
			, [`?>${phpCode}`]
			, {async: true}
		);

		return call.finally(() => this.flush());
	}

	exec(phpCode)
	{
		return this._enqueue(phpCode => this._exec(phpCode), [phpCode]);
	}

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
				if(fragments.length)
					code += fragments.shift();

				if(names.length)
				{
					code += `(vrzno_shared('${names.shift()}'))`;
				}
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
}

PhpBase.phpVersion = phpVersion;
PhpBase.phpVersionFull = phpVersionFull;
