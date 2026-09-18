/** Store recovery snapshots outside the PHP filesystem and its IndexedDB stores. */
export const createEditorRecoveryStore = scope => {
	let database;
	const open = () => database ??= new Promise((resolve, reject) => {
		const request = indexedDB.open('php-wasm-editor-recovery', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('sessions', {keyPath: 'key'});
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Draft storage is blocked by another editor window.'));
	});
	const transaction = async (mode, callback) => {
		const db = await open();
		return new Promise((resolve, reject) => {
			const tx = db.transaction('sessions', mode);
			const request = callback(tx.objectStore('sessions'));
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error || request.error);
			tx.onabort = () => reject(tx.error || new Error('Draft storage transaction was aborted.'));
		});
	};
	return {
		read: async key => {
			if(!key) return null;
			const record = await transaction('readonly', store => store.get(key));
			return record?.scope === scope ? record : null;
		}
		, write: (key, snapshot) => transaction('readwrite', store => store.put({...snapshot, key, scope, updatedAt: Date.now()}))
		, remove: key => transaction('readwrite', store => store.delete(key))
		, close: async () => {
			if(database) (await database).close();
		}
	};
};

/** Serialize only dirty text buffers; clean files reopen from the current filesystem. */
export const editorRecoverySnapshot = workspace => ({
	format: 1
	, root: workspace.root
	, expanded: [...workspace.expanded]
	, activeId: workspace.model.activeId
	, recent: workspace.model.recent
	, documents: [...workspace.model.documents.values()].map(doc => ({
		id: doc.id
		, path: doc.path
		, name: doc.name
		, dirty: doc.dirty
		, bom: doc.bom
		, eol: doc.eol
		, revision: doc.revision
		, ...(doc.dirty && doc.session ? {text: doc.session.getValue(), baseline: doc.baseline} : {})
	}))
});
