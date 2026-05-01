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
