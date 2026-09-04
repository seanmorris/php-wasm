/**
 * @typedef {object} PersistentPhpRuntime
 * @property {boolean} [persist] Indicates whether the runtime has persistent storage enabled.
 * @property {{syncfs?: (populate: boolean, callback: (error?: Error) => void) => void}} [FS] Filesystem bridge exposed by the runtime.
 */

/**
 * @typedef {object} TransactionalWrapper
 * @property {Promise<PersistentPhpRuntime>} binary Deferred runtime instance used for transaction work.
 * @property {boolean|Promise<void>} transactionStarted Tracks the currently active transaction, if any.
 * @property {PersistentPhpRuntime|null} [transactionRuntime] Runtime captured when the active transaction started.
 */

const fallbackLocks = new Map();

/**
 * Clears transaction state if it still belongs to the supplied transaction.
 * @param {TransactionalWrapper} wrapper Runtime wrapper coordinating FS transactions.
 * @param {Promise<void>} transactionStarted Transaction whose state should be cleared.
 */
const clearTransaction = (wrapper, transactionStarted) => {
	if(wrapper.transactionStarted === transactionStarted)
	{
		wrapper.transactionStarted = false;
		wrapper.transactionRuntime = null;
	}
};

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
	if(wrapper.transactionStarted)
	{
		await wrapper.transactionStarted;
		return;
	}

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

	let acceptStart, rejectStart;
	const transactionStarted = new Promise((accept, reject) => {
		acceptStart = accept;
		rejectStart = reject;
	});

	wrapper.transactionRuntime = php;
	wrapper.transactionStarted = transactionStarted;

	try
	{
		php.FS.syncfs(true, error => {
			if(error)
			{
				rejectStart(error);
			}
			else
			{
				acceptStart();
			}
		});
	}
	catch(error)
	{
		rejectStart(error);
	}

	try
	{
		return await transactionStarted;
	}
	catch(error)
	{
		clearTransaction(wrapper, transactionStarted);
		throw error;
	}
}

/**
 * Commits a persisted filesystem transaction for a runtime wrapper.
 * @param {TransactionalWrapper} wrapper Runtime wrapper coordinating FS transactions.
 * @param {boolean} readOnly Indicates whether the transaction only performed reads.
 * @returns {Promise<void>} Resolves when the transaction has been committed.
 */
export async function commitTransaction(wrapper, readOnly = false)
{
	const transactionStarted = wrapper.transactionStarted;

	if(!transactionStarted)
	{
		const php = await wrapper.binary;

		if(!php.persist)
		{
			return;
		}

		throw new Error('No transaction initialized.');
	}

	const php = wrapper.transactionRuntime;

	if(!php)
	{
		clearTransaction(wrapper, transactionStarted);
		throw new Error('No transaction initialized.');
	}

	try
	{
		await transactionStarted;

		if(readOnly)
		{
			return;
		}

		return await new Promise((accept, reject) => {
			return php.FS.syncfs(false, error => {
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
	}
	finally
	{
		clearTransaction(wrapper, transactionStarted);
	}
}
