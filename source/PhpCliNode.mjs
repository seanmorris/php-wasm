import { PhpBase } from './PhpBase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const NUM = 'number';
const SUPPORTED_VERSIONS = new Set(['8.5', '8.4', '8.3', '8.2', '8.1', '8.0']);
const defaultVersion = /** @type {PhpRuntimeVersion} */ (
	SUPPORTED_VERSIONS.has(process.env.PHP_VERSION ?? '')
		? process.env.PHP_VERSION
		: '8.4'
);
const normalizeRuntimeModule = runtime => runtime && typeof runtime === 'object' && 'default' in runtime
	? runtime
	: {default: runtime};

const loadRuntime = specifier => {
	if(typeof require === 'function')
	{
		return Promise.resolve(
			normalizeRuntimeModule(require(specifier.replace(/\.mjs$/, '.js')))
		);
	}

	return import(specifier).then(normalizeRuntimeModule);
};

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
 * Node.js-hosted PHP CLI wrapper.
 */
export class PhpCliNode extends PhpBase
{
	/**
	 * Creates a Node.js-hosted PHP CLI runtime.
	 * @param {PhpRuntimeArgs} args CLI runtime configuration.
	 */
	constructor(args = {})
	{
		const version = /** @type {PhpRuntimeVersion} */ (args.version ?? defaultVersion);
		const constructorArgs = {locateFile: createLocateFile(), version, ...args};

		switch(version)
		{
			case '8.5':
				super(loadRuntime('./php8.5-cli-node.mjs'), constructorArgs, 'cli');
				break;

			case '8.4':
				super(loadRuntime('./php8.4-cli-node.mjs'), constructorArgs, 'cli');
				break;

			case '8.3':
				super(loadRuntime('./php8.3-cli-node.mjs'), constructorArgs, 'cli');
				break;

			case '8.2':
				super(loadRuntime('./php8.2-cli-node.mjs'), constructorArgs, 'cli');
				break;

			case '8.1':
				super(loadRuntime('./php8.1-cli-node.mjs'), constructorArgs, 'cli');
				break;

			case '8.0':
				super(loadRuntime('./php8.0-cli-node.mjs'), constructorArgs, 'cli');
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${version}`);
		}

		this.interactive = false;

		if(constructorArgs.interactive)
		{
			this.interactive = true;
		}
		else if(constructorArgs.script)
		{
			this.script = constructorArgs.script;
		}
		else if(constructorArgs.code)
		{
			this.code = constructorArgs.code;
		}

		this.binary = this.binary.then((php) => {
			php.inputDataQueue = [];
			php.awaitingInput = null;
			php.triggerStdin = () => this.dispatchEvent(new CustomEvent('stdin-request'));
			this.addEventListener('stdin-request', async () => this.flush());
			return php;
		});
	}

	/**
	 * Queues a line of input for the interactive CLI session.
	 * @param {string} line Input line to send to the interactive CLI process.
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
	}

	/**
	 * Builds CLI flags and queues the main PHP CLI process.
	 * @param {string[]} flags CLI flags to pass to the PHP process.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the PHP process exit status.
	 */
	run(flags = [])
	{
		const cliFlags = [...flags];

		if(this.interactive)
		{
			cliFlags.push('-a');
		}
		else if(this.script)
		{
			cliFlags.push('-f', this.script);
		}
		else if(this.code)
		{
			cliFlags.push('-r', this.code);
		}

		return this._enqueue(
			/**
			 * Executes queued CLI flags.
			 * @param {...PhpQueueParam} params Queued CLI flag payload.
			 * @returns {Promise<number>} Resolves with the CLI execution result.
			 */
			(...params) => this._run(/** @type {string[]} */ (params[0] ?? [])),
			[cliFlags]
		);
	}

	/**
	 * Executes the PHP CLI binary with a prepared flag list.
	 * @param {string[]} flags CLI flags to pass to the PHP process.
	 * @returns {Promise<number>} Resolves with the PHP process exit status.
	 */
	async _run(flags = [])
	{
		const php = await this.binary;
		const cmd = ['php', '-c', '/php.ini', ...flags];
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
			return await php.ccall(
				'main'
				, NUM
				, [NUM, NUM]
				, [ptrs.length, arLoc]
				, {async: true}
			);
		}
		catch(error)
		{
			return error.status;
		}
		finally
		{
			this.flush();
		}
	}
}
