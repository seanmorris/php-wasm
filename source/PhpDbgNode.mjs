import { PhpBase } from './PhpBase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const NUM = 'number';
const STR = 'string';

/** PHP type names indexed by Zend type tag. */
const zvalTypeNames = ['undefined', 'null', 'bool', 'bool', 'int', 'float', 'string', 'array', 'object', 'resource'];

/**
 * Finds the zval behind a value that a debugger dump returned.
 * @param {PhpRuntimeValue} value Value from a debugger dump.
 * @returns {number} Pointer to the zval, or 0 for a plain JavaScript value.
 */
const zvalPointer = value => {
	if(value === null || (typeof value !== 'object' && typeof value !== 'function'))
	{
		return 0;
	}

	const symbol = Object.getOwnPropertySymbols(value).find(candidate => candidate.description === 'origZval');

	return symbol ? value[symbol] : 0;
};

/**
 * Describes a value that has no zval, from what JavaScript can tell.
 * @param {PhpRuntimeValue} value Scalar reached through a parent array or object.
 * @returns {{type: string, className: null, count: number|null, reference: boolean}} Inferred description.
 */
const describeScalar = value => {
	const names = {undefined: 'undefined', boolean: 'bool', string: 'string', function: 'callable'};
	let type = names[typeof value] ?? 'unknown';

	if(value === null)
	{
		type = 'null';
	}
	else if(typeof value === 'number')
	{
		type = Number.isInteger(value) ? 'int' : 'float';
	}

	return {
		type
		, className: null
		, count: type === 'string' ? new TextEncoder().encode(String(value)).length : null
		, reference: false
	};
};
const SUPPORTED_VERSIONS = new Set(['8.5', '8.4', '8.3', '8.2', '8.1', '8.0']);
const defaultVersion = /** @type {PhpRuntimeVersion} */ (
	SUPPORTED_VERSIONS.has(process.env.PHP_VERSION ?? '')
		? process.env.PHP_VERSION
		: '8.4'
);

const createLocateFile = () => (name, dir) => {
	if(name.startsWith('file://'))
	{
		name = new URL(name).pathname;
	}

	if(dir === '')
	{
		// The CommonJS build replaces import.meta.url with undefined.
		const moduleUrl = import.meta.url;
		dir = moduleUrl ? path.dirname(url.fileURLToPath(moduleUrl)) : __dirname;
	}

	const located = path.resolve(path.format({dir, name}));

	if(fs.existsSync(located))
	{
		return located;
	}
};

/**
 * Node.js-hosted PHP debugger wrapper.
 */
export class PhpDbgNode extends PhpBase
{
	/**
	 * Creates a Node.js-hosted PHP debugger runtime.
	 * @param {PhpDbgRuntimeArgs} args Debug runtime configuration. `dbgArgs` adds phpdbg command-line arguments, such as `['-q']` to skip the welcome banner.
	 */
	constructor(args = {})
	{
		if(args.dbgArgs !== undefined && !(Array.isArray(args.dbgArgs) && args.dbgArgs.every(arg => typeof arg === 'string')))
		{
			throw new TypeError('dbgArgs must be an array of strings');
		}

		const version = /** @type {PhpRuntimeVersion} */ (args.version ?? defaultVersion);
		const constructorArgs = {locateFile: createLocateFile(), version, ...args};

		switch(version)
		{
			case '8.5':
				super(import('./php8.5-dbg-node.mjs'), constructorArgs, 'phpdbg');
				break;

			case '8.4':
				super(import('./php8.4-dbg-node.mjs'), constructorArgs, 'phpdbg');
				break;

			case '8.3':
				super(import('./php8.3-dbg-node.mjs'), constructorArgs, 'phpdbg');
				break;

			case '8.2':
				super(import('./php8.2-dbg-node.mjs'), constructorArgs, 'phpdbg');
				break;

			case '8.1':
				super(import('./php8.1-dbg-node.mjs'), constructorArgs, 'phpdbg');
				break;

			case '8.0':
				super(import('./php8.0-dbg-node.mjs'), constructorArgs, 'phpdbg');
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${version}`);
		}

		this.dbgArgs = [...(args.dbgArgs ?? [])];
		this.dbgApiVersion = null;
		this.running = false;
		this.paused = false;
		this.currentFilePtr = null;
		this.currentLinePtr = null;
		this.bpCountPtr = null;

		this.binary = this.binary.then((php) => {
			php.inputDataQueue = [];
			php.awaitingInput = null;
			php.triggerStdin = prompt => this.dispatchEvent(new CustomEvent('stdin-request', {
				detail: {prompt: prompt ?? null}
			}));
			return php;
		});
	}

	/**
	 * Starts the phpdbg main loop.
	 * @returns {Promise<number>} Resolves when the debugger main loop starts.
	 */
	run()
	{
		return this._main();
	}

	/**
	 * Queues a line of input for the debugger process.
	 * @param {string} line Input line to send to the debugger process.
	 * @returns {Promise<void>} Resolves after the input has been queued.
	 */
	async provideInput(line)
	{
		const php = await this.binary;

		php.inputDataQueue.push(line + '\n');

		if(php.awaitingInput)
		{
			php.awaitingInput(php.inputDataQueue.shift());
			php.awaitingInput = null;
		}

		this.addEventListener('stdin-request', async () => {
			this.flush();
		}, {once: true});
	}

	/**
	 * Launches the phpdbg process and captures native debugger pointers.
	 * @returns {Promise<number>} Resolves with the debugger process promise.
	 */
	async _main()
	{
		const php = await this.binary;
		const cmd = ['phpdbg', '-c', '/php.ini', ...this.dbgArgs, '-e'];
		const ptrs = cmd.map(part => {
			const len = php.lengthBytesUTF8(part) + 1;
			const loc = php._malloc(len);
			php.stringToUTF8(part, loc, len);
			return loc;
		});
		const arLoc = php._malloc(4 * (ptrs.length + 1));

		for(const [index, ptr] of ptrs.entries())
		{
			php.setValue(arLoc + 4 * index, ptr, '*');
		}

		php.setValue(arLoc + 4 * ptrs.length, 0, '*');

		try
		{
			const process = php.ccall(
				'wasm_sapi_phpdbg_main'
				, NUM
				, [NUM, NUM]
				, [ptrs.length, arLoc]
				, {async: true}
			);

			this.currentFilePtr = php.ccall(
				'phpdbg_wasm_get_current_file'
				, NUM
				, []
				, []
				, {}
			);

			this.currentLinePtr = php.ccall(
				'phpdbg_wasm_get_current_line'
				, NUM
				, []
				, []
				, {}
			);

			this.bpCountPtr = php.ccall(
				'php_wasm_get_bpcount'
				, NUM
				, []
				, []
				, {}
			);

			return process;
		}
		finally
		{
			this.flush();
		}
	}

	/**
	 * Reads the current phpdbg prompt string.
	 * @returns {Promise<string>} The current phpdbg prompt string.
	 */
	async getPrompt()
	{
		const php = await this.binary;

		return php.ccall(
			'phpdbg_get_prompt'
			, STR
			, []
			, []
			, {}
		);
	}

	/**
	 * Checks whether the debugger is currently executing code.
	 * @returns {Promise<number>} Non-zero when PHP code is currently executing.
	 */
	async isExecuting()
	{
		const php = await this.binary;

		return php.ccall(
			'php_wasm_is_executing'
			, NUM
			, []
			, []
			, {}
		);
	}

	/**
	 * Checks whether the debugger is inside an active run loop.
	 * @returns {Promise<number>} Non-zero while a debug run is active.
	 */
	async isRunning()
	{
		const php = await this.binary;

		return php.ccall(
			'php_wasm_is_running'
			, NUM
			, []
			, []
			, {}
		);
	}

	/**
	 * Reads the current file name from the debugger state.
	 * @returns {Promise<string>} Source file path for the current debugger frame.
	 */
	async currentFile()
	{
		const php = await this.binary;

		return php.UTF8ToString(php.getValue(this.currentFilePtr, '*'));
	}

	/**
	 * Reads the current line number from the debugger state.
	 * @returns {Promise<number>} Source line number for the current debugger frame.
	 */
	async currentLine()
	{
		const php = await this.binary;

		return php.getValue(this.currentLinePtr, 'i32');
	}

	/**
	 * Reads the current breakpoint count from the debugger state.
	 * @returns {Promise<number>} Number of registered breakpoints.
	 */
	async bpCount()
	{
		const php = await this.binary;

		return php.getValue(this.bpCountPtr, 'i32');
	}

	/**
	 * Dumps local variables from the current debugger frame.
	 * @returns {Promise<object|undefined>} Dumped local symbol table for the current frame.
	 */
	async dumpVars()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_symbols', NUM, [NUM], [false], {});

		if(ptr)
		{
			return this.dumpSymbols(ptr, php);
		}
	}

	/**
	 * Dumps global variables from the debugger session.
	 * @param {object} [options] Dump options.
	 * @param {boolean} [options.user] Include user-defined globals as well as superglobals. Needs debugger API 2.
	 * @returns {Promise<object|undefined>} Dumped global symbol table.
	 */
	async dumpGlobals({user = false} = {})
	{
		const php = await this.binary;

		if(user)
		{
			this._requireDbgApi(php, 'dumpGlobals({user: true})');
		}

		const ptr = php.ccall('vrzno_dbg_dump_symbols', NUM, [NUM], [user ? 2 : 1], {});

		if(ptr)
		{
			return this.dumpSymbols(ptr, php);
		}
	}

	/**
	 * Dumps defined constants from the debugger session.
	 * @returns {Promise<object|undefined>} Dumped constant table.
	 */
	async dumpConstants()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_constants', NUM, [], [], {});

		if(ptr)
		{
			return this.dumpSymbols(ptr, php);
		}
	}

	/**
	 * Decodes a native symbol dump buffer into a JavaScript object.
	 * @param {number} ptr Pointer to the native symbol dump buffer.
	 * @param {object} php PHP module instance used to decode the symbol buffer.
	 * @returns {object} Decoded symbol table.
	 */
	dumpSymbols(ptr, php)
	{
		const heap = new DataView(php.HEAPU8.buffer);
		const end = ptr + heap.getUint32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const symbols = {};

		while(cur < end)
		{
			const zv = heap.getUint32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const name = decoder.decode(php.HEAPU8.slice(cur, cur + nameLen));
			cur += nameLen + 1;

			symbols[name] = php.zvalToJS(zv);
		}

		php._free(ptr);

		return symbols;
	}

	/**
	 * Dumps userland functions known to the debugger.
	 * @returns {Promise<object>} Dumped function metadata indexed by name.
	 */
	async dumpFunctions()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_functions', NUM, [], [], {});
		const heap = new DataView(php.HEAPU8.buffer);
		const end = ptr + heap.getUint32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const functions = {};

		while(cur < end)
		{
			const filenameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAPU8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			const lineNo = heap.getUint32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const name = decoder.decode(php.HEAPU8.slice(cur, cur + nameLen));
			cur += nameLen + 1;

			functions[name] = {name, filename, lineNo};
		}

		php._free(ptr);

		return functions;
	}

	/**
	 * Dumps userland classes known to the debugger.
	 * @returns {Promise<object>} Dumped class metadata indexed by name.
	 */
	async dumpClasses()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_classes', NUM, [], [], {});
		const heap = new DataView(php.HEAPU8.buffer);
		const end = ptr + heap.getUint32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const functions = {};

		while(cur < end)
		{
			const filenameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAPU8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			const lineNo = heap.getUint32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const name = decoder.decode(php.HEAPU8.slice(cur, cur + nameLen));
			cur += nameLen + 1;

			functions[name] = {name, filename, lineNo};
		}

		php._free(ptr);

		return functions;
	}

	/**
	 * Dumps the file list known to the debugger.
	 * @returns {Promise<string[]>} Dumped list of loaded source files.
	 */
	async dumpFiles()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_files', NUM, [], [], {});
		const heap = new DataView(php.HEAPU8.buffer);
		const end = ptr + heap.getUint32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const files = [];

		while(cur < end)
		{
			const filenameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAPU8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			files.push(filename);
		}

		php._free(ptr);

		return files;
	}

	/**
	 * Dumps the current debugger backtrace, numbered from the innermost frame whichever frame is selected.
	 * With debugger API 2 each frame also has `functionName` and `className`, and its index always matches switchFrame().
	 * @returns {Promise<Array<{filename: string, lineNo: number, frame: number, selected: boolean, functionName?: string, className?: string}>>} Stack frames for the current backtrace.
	 */
	async dumpBacktrace()
	{
		const php = await this.binary;
		if(this._dbgApiVersion(php) >= 2)
		{
			return this._dumpFrames(php);
		}

		// The native dump starts at the selected frame. List from the innermost
		// frame so indexes match switchFrame(), then put the selection back.
		const selected = php.ccall('vrzno_dbg_switch_frame', NUM, [NUM], [0], {});
		const ptr = php.ccall('vrzno_dbg_dump_backtrace', NUM, [], [], {});

		if(selected > 0)
		{
			php.ccall('vrzno_dbg_switch_frame', NUM, [NUM], [selected], {});
		}

		const heap = new DataView(php.HEAPU8.buffer);
		const end = ptr + heap.getUint32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const frames = [];
		let index = 0;

		while(cur < end)
		{
			const filenameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAPU8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			const lineNo = heap.getUint32(cur, true);
			cur += pointerLen;

			frames.push({filename, lineNo, frame: index, selected: index === Math.max(selected, 0)});
			index++;
		}

		php._free(ptr);

		return frames;
	}

	/**
	 * Reports which native debugger exports this runtime's Vrzno provides.
	 * @returns {Promise<number>} 2 when frame names, user globals and value types are available, otherwise 1.
	 */
	async debuggerApiVersion()
	{
		return this._dbgApiVersion(await this.binary);
	}

	/**
	 * Reads and caches the native debugger API version.
	 * @param {object} php PHP module instance.
	 * @returns {number} Debugger API version.
	 */
	_dbgApiVersion(php)
	{
		if(this.dbgApiVersion === null)
		{
			// An older Vrzno has no version export.
			const version = this._hasNativeExport(php, 'vrzno_dbg_api_version')
				? php.ccall('vrzno_dbg_api_version', NUM, [], [], {})
				: 1;

			this.dbgApiVersion = version >= 2 ? version : 1;
		}

		return this.dbgApiVersion;
	}

	/**
	 * Finds a native export without calling it. ccall() on a missing export
	 * aborts a runtime built with assertions, and catching the error does not
	 * undo the abort.
	 * @param {object} php PHP module instance.
	 * @param {string} name Export name, without the leading underscore.
	 * @returns {boolean} Whether the export can be called.
	 */
	_hasNativeExport(php, name)
	{
		if(typeof php['_' + name] === 'function')
		{
			return true;
		}

		// A Vrzno loaded as a side module keeps its exports out of the module
		// object. The runtime's symbol resolver finds them where it is exported.
		return typeof php.resolveGlobalSymbol?.(name)?.sym === 'function';
	}

	/**
	 * Rejects a call that needs exports an older Vrzno lacks.
	 * @param {object} php PHP module instance.
	 * @param {string} method Name of the calling method, for the message.
	 * @returns {void}
	 */
	_requireDbgApi(php, method)
	{
		if(this._dbgApiVersion(php) < 2)
		{
			throw new Error(`${method} needs debugger API 2, and this runtime's Vrzno provides API 1`);
		}
	}

	/**
	 * Dumps local variables with their PHP types.
	 * @returns {Promise<Array<object>>} One `{name, type, className, count, reference, value}` per variable.
	 */
	async describeVars()
	{
		return this._describeScope(0, 'describeVars()');
	}

	/**
	 * Dumps global variables with their PHP types.
	 * @param {object} [options] Dump options.
	 * @param {boolean} [options.user] Include user-defined globals as well as superglobals.
	 * @returns {Promise<Array<object>>} One `{name, type, className, count, reference, value}` per variable.
	 */
	async describeGlobals({user = false} = {})
	{
		return this._describeScope(user ? 2 : 1, 'describeGlobals()');
	}

	/**
	 * Dumps user-defined constants with their PHP types.
	 * @returns {Promise<Array<object>>} One `{name, type, className, count, reference, value}` per constant.
	 */
	async describeConstants()
	{
		const php = await this.binary;

		this._requireDbgApi(php, 'describeConstants()');

		const ptr = php.ccall('vrzno_dbg_dump_constants', NUM, [], [], {});

		return ptr ? this._describeSymbols(ptr, php) : [];
	}

	/**
	 * Describes a value taken from a dump, such as an array element or a property.
	 * A scalar reached through a parent carries no PHP type, so an integral float reads as `int`; use describeChild() to keep it.
	 * @param {PhpRuntimeValue} value Value from a debugger dump.
	 * @returns {Promise<object>} `{type, className, count, reference, value}`.
	 */
	async describeValue(value)
	{
		const php = await this.binary;

		this._requireDbgApi(php, 'describeValue()');

		const zv = zvalPointer(value);

		return {...(zv ? this._describeZval(php, zv) : describeScalar(value)), value};
	}

	/**
	 * Describes one array element or object property from a dump, with its own PHP type.
	 * @param {object} parent Array or object from a debugger dump.
	 * @param {string} key Element key or property name, as `Object.keys(parent)` lists it.
	 * @returns {Promise<object>} `{type, className, count, reference, value}`.
	 */
	async describeChild(parent, key)
	{
		const php = await this.binary;

		this._requireDbgApi(php, 'describeChild()');

		const parentZv = zvalPointer(parent);
		let zv = 0;

		if(parentZv)
		{
			// Private and protected property names contain NUL bytes, so pass the length.
			const bytes = new TextEncoder().encode(String(key));
			const keyPtr = php._malloc(bytes.length + 1);

			php.HEAPU8.set(bytes, keyPtr);
			php.HEAPU8[keyPtr + bytes.length] = 0;

			zv = php.ccall('vrzno_dbg_zval_child', NUM, [NUM, NUM, NUM], [parentZv, keyPtr, bytes.length], {});

			php._free(keyPtr);
		}

		// Convert the element PHP found. Reading it through the parent returns
		// the stand-in's own property for a key such as "length".
		const value = zv ? php.zvalToJS(zv) : parent[key];

		zv = zv || zvalPointer(value);

		return {...(zv ? this._describeZval(php, zv) : describeScalar(value)), value};
	}

	/**
	 * Dumps one symbol scope with types.
	 * @param {number} scope 0 for locals, 1 for superglobals, 2 for every global.
	 * @param {string} method Name of the calling method, for the message.
	 * @returns {Promise<Array<object>>} Described symbols.
	 */
	async _describeScope(scope, method)
	{
		const php = await this.binary;

		this._requireDbgApi(php, method);

		const ptr = php.ccall('vrzno_dbg_dump_symbols', NUM, [NUM], [scope], {});

		return ptr ? this._describeSymbols(ptr, php) : [];
	}

	/**
	 * Decodes a native symbol dump buffer into described symbols.
	 * @param {number} ptr Pointer to the native symbol dump buffer.
	 * @param {object} php PHP module instance.
	 * @returns {Array<object>} Described symbols.
	 */
	_describeSymbols(ptr, php)
	{
		const heap = new DataView(php.HEAPU8.buffer);
		const end = ptr + heap.getUint32(ptr, true);
		const pointerLen = 4;
		const decoder = new TextDecoder;
		const entries = [];
		let cur = ptr + pointerLen;

		// Read the whole buffer before converting values: conversion can grow
		// the heap, which would detach this view.
		while(cur < end)
		{
			const zv = heap.getUint32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getUint32(cur, true);
			cur += pointerLen;

			entries.push({zv, name: decoder.decode(php.HEAPU8.slice(cur, cur + nameLen))});
			cur += nameLen + 1;
		}

		php._free(ptr);

		return entries.map(({zv, name}) => ({name, ...this._describeZval(php, zv), value: php.zvalToJS(zv)}));
	}

	/**
	 * Reads the PHP type of a zval.
	 * @param {object} php PHP module instance.
	 * @param {number} zv Pointer to the zval.
	 * @returns {{type: string, className: string|null, count: number|null, reference: boolean}} Type description.
	 */
	_describeZval(php, zv)
	{
		const type = zvalTypeNames[php.ccall('vrzno_dbg_zval_type', NUM, [NUM], [zv], {})] ?? 'unknown';
		const count = php.ccall('vrzno_dbg_zval_count', NUM, [NUM], [zv], {});

		return {
			type
			, className: type === 'object' ? php.ccall('vrzno_dbg_zval_class', STR, [NUM], [zv], {}) : null
			, count: count < 0 ? null : count
			, reference: !!php.ccall('vrzno_dbg_zval_is_reference', NUM, [NUM], [zv], {})
		};
	}

	/**
	 * Decodes the frame dump of debugger API 2.
	 * @param {object} php PHP module instance.
	 * @returns {Array<object>} Stack frames from the innermost one.
	 */
	_dumpFrames(php)
	{
		const ptr = php.ccall('vrzno_dbg_dump_frames', NUM, [], [], {});
		const frames = [];

		if(!ptr)
		{
			return frames;
		}

		const heap = new DataView(php.HEAPU8.buffer);
		const pointerLen = 4;
		const end = ptr + pointerLen + heap.getUint32(ptr, true);
		const decoder = new TextDecoder;
		let cur = ptr + pointerLen;

		const readWord = () => {
			const value = heap.getUint32(cur, true);
			cur += pointerLen;

			return value;
		};

		const readString = () => {
			const len = readWord();
			const value = decoder.decode(php.HEAPU8.slice(cur, cur + len));
			cur += len + 1;

			return value;
		};

		while(cur < end)
		{
			const filename = readString();
			const lineNo = readWord();
			const functionName = readString();
			const className = readString();
			const flags = readWord();

			frames.push({filename, lineNo, frame: frames.length, selected: !!(flags & 1), functionName, className});
		}

		php._free(ptr);

		return frames;
	}

	/**
	 * Switches the active debugger frame.
	 * @param {number} frame Stack frame index to select.
	 * @returns {Promise<number>} Native return code from the frame switch operation.
	 */
	async switchFrame(frame)
	{
		const php = await this.binary;

		return php.ccall('vrzno_dbg_switch_frame', NUM, [NUM], [frame], {});
	}
}
