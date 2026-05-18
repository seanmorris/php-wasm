import { PhpBase } from './PhpBase.mjs';
import { commitTransaction, startTransaction } from './webTransactions.mjs';

const NUM = 'number';
const STR = 'string';

const defaultVersion = '8.3';

/**
 * Browser-hosted PHP CLI wrapper.
 */
export class PhpCliWeb extends PhpBase
{
	/**
	 * Creates a browser-hosted PHP CLI runtime.
	 * @param {PhpRuntimeArgs} args CLI runtime configuration.
	 */
	constructor(args = {})
	{
		const version = args.version ?? defaultVersion;
		const constructorArgs = {version, ...args};

		switch(version)
		{
			case '8.5':
				super(import(`./php8.5-cli-web.mjs`), constructorArgs, 'cli');
				break;

			case '8.4':
				super(import(`./php8.4-cli-web.mjs`), constructorArgs, 'cli');
				break;

			case '8.3':
				super(import(`./php8.3-cli-web.mjs`), constructorArgs, 'cli');
				break;

			case '8.2':
				super(import(`./php8.2-cli-web.mjs`), constructorArgs, 'cli');
				break;

			case '8.1':
				super(import(`./php8.1-cli-web.mjs`), constructorArgs, 'cli');
				break;

			case '8.0':
				super(import(`./php8.0-cli-web.mjs`), constructorArgs, 'cli');
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
	 * Starts a persisted browser transaction for the CLI runtime.
	 * @returns {Promise<void>} Resolves when the transaction lock has been acquired.
	 */
	startTransaction()
	{
		return startTransaction(this);
	}

	/**
	 * Commits a persisted browser transaction for the CLI runtime.
	 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
	 * @returns {Promise<void>} Resolves when the transaction has been committed.
	 */
	commitTransaction(readOnly = false)
	{
		return commitTransaction(this, readOnly);
	}

	/**
	 * Queues a line of input for the interactive CLI session.
	 * @param {string} line Input line to send to the interactive CLI process.
	 * @returns {Promise<void>} Resolves after the input has been queued.
	 */
	async provideInput(line)
	{
		const php = await this.binary;
		await this.startTransaction();

		php.inputDataQueue.push(line + '\n');

		if(php.awaitingInput)
		{
			php.awaitingInput( php.inputDataQueue.shift() );
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
		if(this.interactive)
		{
			flags.push('-a');
		}
		else if(this.script)
		{
			flags.push('-f', this.script);
		}
		else if(this.code)
		{
			flags.push('-r', this.code);
		}

		return this._enqueue(
			/**
			 * Executes queued CLI flags.
			 * @param {string[]} phpCode CLI flags queued for execution.
			 * @returns {Promise<PhpRuntimeValue>} Resolves with the CLI execution result.
			 */
			phpCode => this._run(phpCode),
			[flags]
		);
	}

	/**
	 * Executes the PHP CLI binary with a prepared flag list.
	 * @param {string[]} flags CLI flags to pass to the PHP process.
	 * @returns {Promise<number>} Resolves with the PHP process exit status.
	 */
	async _run(flags = [])
	{
		const php = (await this.binary);

		const cmd = ['php', '-c', '/php.ini', ...flags];

		const ptrs = cmd.map(part => {
			const len = php.lengthBytesUTF8(part) + 1;
			const loc = php._malloc(len);
			php.stringToUTF8(part, loc, len);
			return loc;
		});

		const arLoc = php._malloc(4 * ptrs.length);

		for(const [i, ptr] of ptrs.entries())
		{
			php.setValue(arLoc + 4 * i, ptr, '*');
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
			// if(!('status' in error ) || error.status !== 0)
			// {
			// 	throw error;
			// }

			return error.status;
		}
		finally
		{
			this.flush();
			// ptrs.forEach(p => php._free(p));
			// php._free(arLoc);
		}
	}

	/**
	 * Refreshes the browser-hosted CLI runtime state.
	 * @returns {Promise<void>} Resolves after the CLI runtime has been refreshed.
	 */
	async refresh()
	{
		await super.refresh();
		// const php = await this.binary;
		// await navigator.locks.request('php-wasm-fs-lock', () => {
		// 	return new Promise((accept, reject) => {
		// 		php.FS.syncfs(true, error => {
		// 			if(error) reject(error);
		// 			else accept();
		// 		});
		// 	});
		// });
	}

	/**
	 * Serializes async CLI operations behind the browser FS lock.
	 * @param {PhpQueuedCallback} callback Async operation to queue.
	 * @param {PhpQueueParams} params Arguments passed to the queued callback.
	 * @param {boolean} readOnly Indicates whether the queued operation mutates state.
	 * @returns {Promise<PhpRuntimeValue>} Resolves with the queued callback result.
	 */
	async _enqueue(callback, params = [], readOnly = false)
	{
		await this.binary;

		let accept, reject;

		const coordinator = new Promise((a,r) => [accept, reject] = [a, r]);

		const _accept = result => accept(result);
		const _reject = reason => reject(reason);

		this.queue.push([callback, params, _accept, _reject]);

		navigator.locks.request('php-wasm-fs-lock', async () => {
			if(!this.queue.length)
			{
				return;
			}

			await ((this.autoTransaction && !readOnly) ? this.startTransaction() : Promise.resolve());

			do
			{
				const [callback, params, accept, reject] = this.queue.shift();
				const run = callback(...params);
				run.then(accept).catch(reject);
				await run;
			} while(this.queue.length);

			await (this.autoTransaction ? this.commitTransaction(readOnly) : Promise.resolve());
		});

		return coordinator;
	}
}
