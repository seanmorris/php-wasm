/**
 * @typedef {object} PersistentPhpRuntime
 * @property {boolean} [persist] Indicates whether the runtime has persistent storage enabled.
 * @property {{syncfs?: (populate: boolean, callback: (error?: Error) => void) => void}} [FS] Filesystem bridge exposed by the runtime.
 */

/**
 * @typedef {object} TransactionalWrapper
 * @property {Promise<PersistentPhpRuntime>} binary Deferred runtime instance used for transaction work.
 * @property {boolean|Promise<void>} transactionStarted Tracks the currently active transaction, if any.
 */

const fallbackLocks = new Map();

/**
 * Runs a callback while holding a named Web Lock when the API is available.
 *
 * Browsers without Web Locks use a FIFO lock scoped to the current JavaScript
 * realm. This preserves in-page runtime serialization, but cannot coordinate
 * filesystem access with other tabs or workers.
 * @template T
 * @param {string} name Lock name.
 * @param {() => T|Promise<T>} callback Work to perform while holding the lock.
 * @returns {Promise<T>} Resolves with the callback result after acquiring the lock.
 */
export function requestWebLock(name, callback)
{
	const lockManager = globalThis.navigator?.locks;

	if(typeof lockManager?.request === 'function')
	{
		return lockManager.request(name, callback);
	}

	const previous = fallbackLocks.get(name) ?? Promise.resolve();
	const operation = previous.then(callback);
	const tail = operation.catch(() => undefined);

	fallbackLocks.set(name, tail);
	tail.then(() => {
		if(fallbackLocks.get(name) === tail)
		{
			fallbackLocks.delete(name);
		}
	});

	return operation;
}

/**
 * Starts a persisted filesystem transaction for a runtime wrapper.
 * @param {TransactionalWrapper} wrapper Runtime wrapper coordinating FS transactions.
 * @returns {Promise<void>} Resolves when the transaction has been started.
 */
export async function startTransaction(wrapper)
{
	const php = await wrapper.binary;

	if(!php.persist)
	{
		return;
	}

	if(wrapper.transactionStarted)
	{
		await wrapper.transactionStarted;
		return;
	}

	wrapper.transactionStarted = new Promise((accept, reject) => {
		return php.FS.syncfs(true, error => {
			if(error)
			{
				reject(error);
			}
			else
			{
				accept();
			}
		});
	});

	return await wrapper.transactionStarted;
}

/**
 * Commits a persisted filesystem transaction for a runtime wrapper.
 * @param {TransactionalWrapper} wrapper Runtime wrapper coordinating FS transactions.
 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
 * @returns {Promise<void>} Resolves when the transaction has been committed.
 */
export async function commitTransaction(wrapper, readOnly = false)
{
	const php = await wrapper.binary;

	if(!php.persist)
	{
		return;
	}

	if(!wrapper.transactionStarted)
	{
		throw new Error('No transaction initialized.');
	}

	if(readOnly)
	{
		wrapper.transactionStarted = false;
		return Promise.resolve();
	}

	return await new Promise((accept, reject) => {
		return php.FS.syncfs(false, error => {
			if(error)
			{
				reject(error);
			}
			else
			{
				wrapper.transactionStarted = false;
				accept();
			}
		});
	});
}
