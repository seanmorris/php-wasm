import { PhpBase } from './PhpBase';
import { commitTransaction, startTransaction } from './webTransactions';

/**
 * WebView-hosted PHP wrapper.
 */
export class PhpWebview extends PhpBase
{
	/**
	 * Creates a WebView-hosted PHP runtime.
	 * @param {object} args Runtime configuration.
	 */
	constructor(args = {})
	{
		super(import(`./php${args.version ?? defaultVersion}-webview.mjs`), args);
	}

	/**
	 * Starts a persisted browser transaction for the WebView runtime.
	 * @returns {Promise<void>} Resolves when the transaction lock has been acquired.
	 */
	startTransaction()
	{
		return startTransaction(this);
	}

	/**
	 * Commits a persisted browser transaction for the WebView runtime.
	 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
	 * @returns {Promise<void>} Resolves when the transaction has been committed.
	 */
	commitTransaction(readOnly = false)
	{
		return commitTransaction(this, readOnly);
	}

	/**
	 * Refreshes the WebView-hosted runtime and syncs its filesystem.
	 * @returns {Promise<void>} Resolves after the WebView runtime has been refreshed.
	 */
	async refresh()
	{
		super.refresh();
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
	 * Serializes async WebView operations behind the browser FS lock.
	 * @param {(...params: unknown[]) => Promise<unknown>} callback Async operation to queue.
	 * @param {unknown[]} params Arguments passed to the queued callback.
	 * @param {boolean} readOnly Indicates whether the queued operation mutates state.
	 * @returns {Promise<unknown>} Resolves with the queued callback result.
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
