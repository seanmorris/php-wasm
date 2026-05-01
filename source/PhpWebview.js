import { PhpBase } from './PhpBase';
import { commitTransaction, startTransaction } from './webTransactions';

const defaultVersion = '8.4';
const defaultVariant = '';

/**
 * WebView-hosted PHP wrapper.
 */
export class PhpWebview extends PhpBase
{
	/**
	 * Creates a WebView-hosted PHP runtime.
	 * @param {PhpRuntimeArgs} args Runtime configuration.
	 */
	constructor(args = {})
	{
		const version = args.version ?? defaultVersion;
		const variant = args.variant ?? defaultVariant;
		const vvId = version + variant;
		const constructorArgs = {version, variant, ...args};

		switch(vvId)
		{
			case '8.5':
				super(import(`./php8.5-webview.mjs`), constructorArgs);
				break;

			case '8.5_sdl':
				super(import(`./php8.5_sdl-webview.mjs`), constructorArgs);
				break;

			case '8.4':
				super(import(`./php8.4-webview.mjs`), constructorArgs);
				break;

			case '8.4_sdl':
				super(import(`./php8.4_sdl-webview.mjs`), constructorArgs);
				break;

			case '8.3':
				super(import(`./php8.3-webview.mjs`), constructorArgs);
				break;

			case '8.3_sdl':
				super(import(`./php8.3_sdl-webview.mjs`), constructorArgs);
				break;

			case '8.2':
				super(import(`./php8.2-webview.mjs`), constructorArgs);
				break;
			case '8.2_sdl':
				super(import(`./php8.2_sdl-webview.mjs`), constructorArgs);
				break;

			case '8.1':
				super(import(`./php8.1-webview.mjs`), constructorArgs);
				break;
			case '8.1_sdl':
				super(import(`./php8.1_sdl-webview.mjs`), constructorArgs);
				break;

			case '8.0':
				super(import(`./php8.0-webview.mjs`), constructorArgs);
				break;
			case '8.0_sdl':
				super(import(`./php8.0_sdl-webview.mjs`), constructorArgs);
				break;

			default:
				throw new Error(`Unsupported PHP runtime: ${vvId}`);
		}
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
		await super.refresh();
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
