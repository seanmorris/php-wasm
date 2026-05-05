import { PhpBase } from 'php-wasm/PhpBase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const NUM = 'number';
const STR = 'string';
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
		if(typeof __dirname === 'undefined')
		{
			dir = path.dirname(url.fileURLToPath(import.meta.url));
		}
		else
		{
			dir = __dirname;
		}
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
	 * @param {PhpRuntimeArgs} args Debug runtime configuration.
	 */
	constructor(args = {})
	{
		const version = /** @type {PhpRuntimeVersion} */ (args.version ?? defaultVersion);
		const constructorArgs = {locateFile: createLocateFile(), version, ...args};

		switch(version)
		{
			case '8.5':
				super(import(`./php8.5-dbg-node.mjs`), constructorArgs, 'phpdbg');
				break;

			case '8.4':
				super(import(`./php8.4-dbg-node.mjs`), constructorArgs, 'phpdbg');
				break;

			case '8.3':
				super(import(`./php8.3-dbg-node.mjs`), constructorArgs, 'phpdbg');
				break;

			case '8.2':
				super(import(`./php8.2-dbg-node.mjs`), constructorArgs, 'phpdbg');
				break;

			case '8.1':
				super(import(`./php8.1-dbg-node.mjs`), constructorArgs, 'phpdbg');
				break;

			case '8.0':
				super(import(`./php8.0-dbg-node.mjs`), constructorArgs, 'phpdbg');
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${version}`);
		}

		this.running = false;
		this.paused = false;
		this.currentFilePtr = null;
		this.currentLinePtr = null;
		this.bpCountPtr = null;

		this.binary = this.binary.then((php) => {
			php.inputDataQueue = [];
			php.awaitingInput = null;
			php.triggerStdin = () => this.dispatchEvent(new CustomEvent('stdin-request'));
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
		const cmd = ['phpdbg', '-c', '/php.ini', '-e'];
		const ptrs = cmd.map(part => {
			const len = php.lengthBytesUTF8(part) + 1;
			const loc = php._malloc(len);
			php.stringToUTF8(part, loc, len);
			return loc;
		});
		const arLoc = php._malloc(4 * ptrs.length);

		for(const [index, ptr] of ptrs.entries())
		{
			php.setValue(arLoc + 4 * index, ptr, '*');
		}

		try
		{
			const process = php.ccall(
				'main'
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
	 * @returns {Promise<object|undefined>} Dumped global symbol table.
	 */
	async dumpGlobals()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_symbols', NUM, [NUM], [true], {});

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
		const heap = new DataView(php.HEAP8.buffer);
		const end = ptr + heap.getInt32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const symbols = {};

		while(cur < end)
		{
			const zv = heap.getInt32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const name = decoder.decode(php.HEAP8.slice(cur, cur + nameLen));
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
		const heap = new DataView(php.HEAP8.buffer);
		const end = ptr + heap.getInt32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const functions = {};

		while(cur < end)
		{
			const filenameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAP8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			const lineNo = heap.getInt32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const name = decoder.decode(php.HEAP8.slice(cur, cur + nameLen));
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
		const heap = new DataView(php.HEAP8.buffer);
		const end = ptr + heap.getInt32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const functions = {};

		while(cur < end)
		{
			const filenameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAP8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			const lineNo = heap.getInt32(cur, true);
			cur += pointerLen;

			const nameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const name = decoder.decode(php.HEAP8.slice(cur, cur + nameLen));
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
		const heap = new DataView(php.HEAP8.buffer);
		const end = ptr + heap.getInt32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const files = [];

		while(cur < end)
		{
			const filenameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAP8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			files.push(filename);
		}

		php._free(ptr);

		return files;
	}

	/**
	 * Dumps the current debugger backtrace.
	 * @returns {Promise<Array<{filename: string, lineNo: number, frame: number}>>} Stack frames for the current backtrace.
	 */
	async dumpBacktrace()
	{
		const php = await this.binary;
		const ptr = php.ccall('vrzno_dbg_dump_backtrace', NUM, [], [], {});
		const heap = new DataView(php.HEAP8.buffer);
		const end = ptr + heap.getInt32(ptr, true);
		const pointerLen = 4;
		let cur = ptr + pointerLen;
		const decoder = new TextDecoder;
		const frames = [];
		let index = 0;

		while(cur < end)
		{
			const filenameLen = heap.getInt32(cur, true);
			cur += pointerLen;

			const filename = decoder.decode(php.HEAP8.slice(cur, cur + filenameLen));
			cur += filenameLen + 1;

			const lineNo = heap.getInt32(cur, true);
			cur += pointerLen;

			frames.push({filename, lineNo, frame: index});
			index++;
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
