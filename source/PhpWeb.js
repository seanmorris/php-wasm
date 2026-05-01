import { PhpBase } from './PhpBase';
import { commitTransaction, startTransaction } from './webTransactions';

const defaultVersion = '8.4';
const defaultVariant = '';

/**
 * Browser-hosted PHP wrapper.
 */
export class PhpWeb extends PhpBase
{
	/**
	 * Creates a browser-hosted PHP runtime.
	 * @param {object} args Runtime configuration.
	 */
	constructor(args = {})
	{
		const version = args.version ?? defaultVersion;
		const variant = args.variant ?? defaultVariant;
		const vvId = version + variant;

		super(import(`./php${vvId}-web.mjs`), {version, variant, ...args});
	}

	/**
	 * Starts a persisted browser transaction for the runtime.
	 * @returns {Promise<void>} Resolves when the transaction lock has been acquired.
	 */
	startTransaction()
	{
		return startTransaction(this);
	}

	/**
	 * Commits a persisted browser transaction for the runtime.
	 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
	 * @returns {Promise<void>} Resolves when the transaction has been committed.
	 */
	commitTransaction(readOnly = false)
	{
		return commitTransaction(this, readOnly);
	}

	/**
	 * Refreshes the browser-hosted runtime and syncs its filesystem.
	 * @returns {Promise<void>} Resolves after the browser runtime has been refreshed.
	 */
	async refresh()
	{
		await super.refresh();
		const php = await this.binary;
		await navigator.locks.request('php-wasm-fs-lock', () => {
			return new Promise((accept, reject) => {
				php.FS.syncfs(true, error => {
					if(error) reject(error);
					else accept();
				});
			});
		});
	}

	/**
	 * Serializes async runtime operations behind the browser FS lock.
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
				let lockChecks = 25;
				while(!this.queue.length && lockChecks--)
				{
					await new Promise(a => setTimeout(a, 5));
				}
			} while(this.queue.length);

			await (this.autoTransaction ? this.commitTransaction(readOnly) : Promise.resolve());
		});

		return coordinator;
	}
}
