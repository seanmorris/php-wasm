/**
 * Pending changes use the existing IDBFS FILE_DATA format. Hydration still uses
 * IDBFS reconciliation; flushing writes only paths changed through MEMFS ops.
 * The caller owns filesystem serialization (the browser wrappers use Web Locks).
 */

const installed = new WeakSet();

/**
 * Installs incremental persistence on an Emscripten MEMFS/IDBFS filesystem.
 * Other backends, including WasmFS and NODEFS, keep their existing behavior.
 * @param {object} FS Native Emscripten filesystem object.
 * @returns {void} Installs once per runtime, without changing the database schema.
 */
export function enableIncrementalIdbfs(FS)
{
	if(!FS?.root?.mount || typeof FS.getMounts !== 'function' || installed.has(FS)) return;
	const backends = new Set(FS.getMounts(FS.root.mount).map(mount => mount.type).filter(type =>
		type?.DB_STORE_NAME === 'FILE_DATA'
		&& ['getDB', 'getLocalSet', 'loadLocalEntry', 'storeLocalEntry', 'removeLocalEntry', 'syncfs'].every(name => typeof type[name] === 'function')
	));
	if(!backends.size) return;
	installed.add(FS);
	const states = new WeakMap();
	const wrapped = new WeakMap();
	let applying = 0;
	const join = (parent, name) => parent.replace(/\/$/, '') + '/' + name;

	/**
	 * Records a path's final state, retaining subtree deletion across recreation.
	 * @param {object} state Mount persistence state.
	 * @param {string} path Absolute path in that mount.
	 * @param {object|null} node Current node, or null after deletion.
	 * @param {boolean} [tree] Remove the prior persisted subtree before writing.
	 */
	function record(state, path, node, tree = false)
	{
		if(applying || path === state.mount.mountpoint) return;
		if(tree)
		{
			for(const key of state.pending.keys()) if(key.startsWith(path + '/')) state.pending.delete(key);
		}
		state.pending.set(path, {node, tree: tree || state.pending.get(path)?.tree || false});
	}

	/**
	 * Tests that an open node still has a name in this filesystem.
	 * Writes through an unlinked or overwritten file descriptor must not resurrect it.
	 * @param {object} node MEMFS node.
	 * @returns {boolean} Whether every parent still names this node.
	 */
	function linked(node)
	{
		for(let current = node; current.parent !== current; current = current.parent)
		{
			if(current.parent.contents?.[current.name] !== current) return false;
		}
		return true;
	}

	/**
	 * Records a live node after a content or metadata mutation.
	 * @param {object} node MEMFS node, possibly outside an IDBFS mount.
	 */
	function mark(node)
	{
		const state = states.get(node?.mount);
		if(state && linked(node)) record(state, FS.getPath(node), node);
	}

	/**
	 * Traverses nodes without repeatedly resolving their absolute paths.
	 * @param {object} node Subtree root.
	 * @param {string} path Root's absolute path.
	 * @param {(node: object, path: string) => void} callback Visitor.
	 */
	function visit(node, path, callback)
	{
		const pending = [[node, path]];
		while(pending.length)
		{
			const [child, childPath] = pending.pop();
			callback(child, childPath);
			if(FS.isDir(child.mode))
			{
				for(const entry of Object.values(child.contents)) pending.push([entry, join(childPath, entry.name)]);
			}
		}
	}

	/**
	 * Attaches native mutation hooks once to each shared MEMFS operations table.
	 * @param {object} node Existing or newly created filesystem node.
	 */
	function attach(node)
	{
		for(const [ops, names] of [
			[node.node_ops, ['mknod', 'symlink', 'rename', 'unlink', 'rmdir', 'setattr']]
			, [node.stream_ops, ['write', 'allocate', 'msync', 'mmap', 'setattr']]
		]){
			if(!ops) continue;
			if(!wrapped.has(ops)) wrapped.set(ops, new Set());
			for(const name of names)
			{
				if(typeof ops[name] !== 'function' || wrapped.get(ops).has(name)) continue;
				wrapped.get(ops).add(name);
				const original = ops[name];
				ops[name] = function(...args) {
					const target = args[0]?.node ?? args[0];
					const state = states.get(target?.mount);
					if(!state) return original.apply(this, args);
					const oldParent = target.parent;
					const oldPath = name === 'rename' ? FS.getPath(target) : null;
					let result;
					try
					{ result = original.apply(this, args); }
					finally
					{
						// Also retain metadata/partial writes if a mutating operation throws.
						if(['write', 'allocate', 'msync', 'setattr'].includes(name)) mark(target);
					}
					if(name === 'mknod' || name === 'symlink')
					{
						attach(result);
						mark(target);
						mark(result);
					}
					else if(name === 'unlink' || name === 'rmdir')
					{
						record(state, join(FS.getPath(target), args[1]), null, name === 'rmdir');
						mark(target);
					}
					else if(name === 'rename')
					{
						const newPath = join(FS.getPath(args[1]), args[2]);
						record(state, oldPath, null, FS.isDir(target.mode));
						record(state, newPath, null, FS.isDir(target.mode));
						visit(target, newPath, (node, path) => record(state, path, node));
						mark(oldParent);
						mark(args[1]);
					}
					else if(name === 'mmap' && !result.allocated && (args[3] & 2) && !(args[4] & 2))
					{
						// Writable MAP_SHARED views can change bytes without another FS call.
						state.aliased.add(target);
					}
					return result;
				};
			}
		}
	}

	/**
	 * Tracks a mount before its first synchronization. The first sync still
	 * establishes a full baseline, including files created before installation.
	 * @param {object} mount IDBFS mount.
	 * @returns {object} Per-mount journal and synchronization queue.
	 */
	function stateFor(mount)
	{
		if(!states.has(mount))
		{
			states.set(mount, {mount, ready: false, failed: false, pending: new Map(), aliased: new Set(), tail: Promise.resolve()});
			visit(mount.root, mount.mountpoint, attach);
		}
		return states.get(mount);
	}

	/**
	 * Removes only generations actually committed; concurrent mutations stay dirty.
	 * @param {object} state Mount persistence state.
	 * @param {Map<string, object>} changes Snapshot at synchronization start.
	 */
	function acknowledge(state, changes)
	{
		for(const [path, change] of changes) if(state.pending.get(path) === change) state.pending.delete(path);
	}

	/**
	 * Commits changed records atomically within one IDBFS mount.
	 * @param {object} backend Existing IDBFS backend.
	 * @param {object} state Mount persistence state.
	 * @returns {Promise<void>} Resolves on transaction completion, not request success.
	 */
	async function flush(backend, state)
	{
		for(const node of state.aliased)
		{
			if(linked(node)) mark(node);
			else state.aliased.delete(node);
		}
		const changes = new Map(state.pending);
		if(!changes.size) return;
		try
		{
			const entries = [];
			for(const [path, change] of changes)
			{
				if(!change.node) continue;
				const entry = await new Promise((resolve, reject) => backend.loadLocalEntry(path, (error, entry) => error ? reject(error) : resolve(entry)));
				// Freeze payloads while getDB/IndexedDB is pending. Later writes retain
				// their own journal entries and cannot change this transaction's data.
				entries.push([path, {...entry, ...(entry.contents && {contents: entry.contents.slice()})}]);
			}
			const db = await new Promise((resolve, reject) => backend.getDB(state.mount.mountpoint, (error, db) => error ? reject(error) : resolve(db)));
			await new Promise((resolve, reject) => {
				const transaction = db.transaction([backend.DB_STORE_NAME], 'readwrite');
				let failure;
				transaction.oncomplete = () => resolve();
				transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('IDBFS transaction aborted.'));
				transaction.onerror = event => {
					failure ??= event.target.error;
					// An explicitly aborted transaction settles only after onabort.
					event.preventDefault();
					try
					{ transaction.abort(); }
					catch
					{ /* An abort already in progress also rejects outstanding requests. */ }
				};
				try
				{
					const store = transaction.objectStore(backend.DB_STORE_NAME);
					for(const [path, change] of changes)
					{
						if(!change.node || change.tree) store.delete(path);
						if(change.tree) store.delete(IDBKeyRange.bound(path + '/', path + '0', false, true));
					}
					for(const [path, entry] of entries) store.put(entry, path);
				}
				catch(error)
				{
					failure = error;
					transaction.abort();
				}
			});
			acknowledge(state, changes);
			state.failed = false;
		}
		catch(error)
		{
			state.failed = true;
			throw error;
		}
	}

	for(const backend of backends)
	{
		const originalSync = backend.syncfs;
		const originalLocal = backend.getLocalSet;
		for(const name of ['storeLocalEntry', 'removeLocalEntry'])
		{
			const original = backend[name];
			backend[name] = (...args) => {
				applying++;
				try
				{
					if(name !== 'storeLocalEntry' || !FS.isLink(args[1].mode)) return original(...args);
					// IDBFS's chmod/utime follow links, which fails for a dangling link
					// or a target hydrated later. Apply metadata to the link itself.
					const [path, entry, callback] = args;
					try
					{
						let node;
						try
						{ node = FS.lookupPath(path).node; }
						catch(error)
						{ if(error.errno !== 44) throw error; }
						if(node && (!FS.isLink(node.mode) || node.link !== entry.link))
						{
							if(FS.isDir(node.mode)) FS.rmdir(path);
							else FS.unlink(path);
							node = null;
						}
						if(!node) node = FS.symlink(entry.link, path);
						const timestamp = entry.timestamp.getTime();
						node.node_ops.setattr(node, {mode: entry.mode, atime: timestamp, mtime: timestamp, ctime: timestamp, timestamp});
					}
					catch(error)
					{ return callback(error); }
					callback(null);
				}
				finally
				{ applying--; }
			};
		}
		backend.getLocalSet = (mount, callback) => {
			if(mount.mounts?.length) return originalLocal(mount, callback);
			const entries = Object.create(null);
			try
			{
				visit(mount.root, mount.mountpoint, (node, path) => {
					if(node !== mount.root) entries[path] = {timestamp: node.node_ops.getattr(node).mtime};
				});
			}
			catch(error)
			{ return callback(error); }
			callback(null, {type: 'local', entries});
		};
		backend.syncfs = (mount, populate, callback) => {
			const state = stateFor(mount);
			const fullSync = async populate => {
				const changes = new Map(state.pending);
				try
				{
					await new Promise((resolve, reject) => originalSync(mount, populate, error => error ? reject(error) : resolve()));
					state.ready = !mount.mounts?.length;
					state.failed = false;
					acknowledge(state, changes);
				}
				catch(error)
				{
					if(!populate) state.failed = true;
					throw error;
				}
			};
			const operation = state.tail.then(async () => {
				// A subsequent hydration must not discard writes whose commit failed.
				if(populate && state.failed)
				{
					if(state.ready) await flush(backend, state);
					else await fullSync(false);
				}
				if(populate || !state.ready || mount.mounts?.length) await fullSync(populate);
				else await flush(backend, state);
			});
			state.tail = operation.catch(() => {});
			operation.then(() => callback(null), error => callback(error));
		};
	}
	for(const mount of FS.getMounts(FS.root.mount)) if(backends.has(mount.type)) stateFor(mount);
}
