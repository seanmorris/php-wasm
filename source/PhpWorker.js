import { PhpBase } from './PhpBase';
import PhpBinary from 'php-wasm/php-worker.mjs';
import { commitTransaction, startTransaction } from './webTransactions';

/**
 * Worker-hosted PHP wrapper.
 */
export class PhpWorker extends PhpBase
{
	/**
	 * Creates a worker-hosted PHP runtime.
	 * @param {object} args Runtime configuration.
	 */
	constructor(args = {})
	{
		super(PhpBinary, args);
	}

	/**
	 * Starts a persisted browser transaction for the worker runtime.
	 * @returns {Promise<void>} Resolves when the transaction lock has been acquired.
	 */
	startTransaction()
	{
		return startTransaction(this);
	}

	/**
	 * Commits a persisted browser transaction for the worker runtime.
	 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
	 * @returns {Promise<void>} Resolves when the transaction has been committed.
	 */
	commitTransaction(readOnly = false)
	{
		return commitTransaction(this, readOnly);
	}

	/**
	 * Refreshes the worker-hosted runtime and syncs its filesystem when needed.
	 * @returns {Promise<void>} Resolves after the worker runtime has been refreshed.
	 */
	async refresh()
	{
		await super.refresh();

		if(!this.phpArgs.persist)
		{
			return;
		}

		const php = await this.binary;
		await navigator.locks.request('php-wasm-fs-lock', () => {
			new Promise((accept, reject) => {
				php.FS.syncfs(true, error => {
					if(error) reject(error);
					else accept();
				});
			});
		});
	}

	/**
	 * Serializes async worker operations behind the browser FS lock.
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
