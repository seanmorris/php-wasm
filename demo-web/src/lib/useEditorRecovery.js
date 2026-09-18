import {useCallback, useEffect, useRef, useState} from 'react';
import {createEditorRecoveryStore, editorRecoverySnapshot} from './editorRecovery';
import {editorFilesystem} from './editorFilesystem';
import {basePath} from './runtimePaths';

/** Recover interrupted explicit-save sessions without modifying live PHP files. */
export const useEditorRecovery = workspace => {
	const current = useRef(workspace);
	current.current = workspace;
	const storage = useRef(null);
	const key = useRef(null);
	const pointer = useRef(null);
	const pending = useRef(null);
	const writeQueue = useRef(Promise.resolve());
	const [ready, setReady] = useState(false);
	const [status, setStatus] = useState('Preparing draft recovery…');
	const [available, setAvailable] = useState(false);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const restore = useCallback(async (snapshot, includeDrafts) => {
		const w = current.current;
		if(snapshot.format !== 1 || !Array.isArray(snapshot.documents)) throw new Error('Unsupported recovery snapshot.');
		w.setRoot(snapshot.root || '/');
		w.setExpanded(new Set(snapshot.expanded || ['/']));
		w.model.recent = snapshot.recent || [];
		let active = null;
		for(const saved of snapshot.documents)
		{
			let doc;
			if(saved.dirty && includeDrafts && typeof saved.text === 'string')
			{
				const existing = saved.path && w.model.find(saved.path);
				doc = existing?.dirty ? w.model.create() : existing || w.model.create(saved.path || null);
				Object.assign(doc, {bom: !!saved.bom, eol: saved.eol || 'unix', revision: saved.revision, loaded: true, binary: false});
				w.model.installSession(doc, saved.text);
				doc.baseline = saved.baseline ?? '';
				doc.dirty = true;
				doc.name = saved.name || doc.name;
				w.model.emit();
				if(doc.path)
				{
					try
					{
						const disk = await editorFilesystem.inspect(doc.path);
						if(disk.revision !== doc.revision) doc.external = disk.exists ? 'changed' : 'deleted';
					}
					catch
					{
						doc.external = 'unverified';
					}
				}
			}
			else if(saved.path) doc = await w.openFile(saved.path);
			if(saved.id === snapshot.activeId) active = doc;
		}
		if(active) w.model.select(active);
		w.model.emit();
	}, []);

	const recover = useCallback(async () => {
		const record = pending.current;
		if(!record) return;
		const w = current.current;
		const choice = await w.ask({title: 'Recover unsaved drafts?', message: record.documents.filter(doc => doc.dirty).map(doc => doc.path || doc.name).join('\n'), choices: [{action: 'recover', label: 'Recover drafts'}, {action: 'discard', label: 'Discard saved drafts'}, {action: 'cancel', label: 'Later'}]});
		if(choice.action === 'cancel') return;
		await restore(record, choice.action === 'recover');
		if(choice.action === 'discard') await storage.current.remove(record.key);
		pending.current = record.pendingRecovery ? await storage.current.read(record.pendingRecovery) : null;
		setAvailable(!!pending.current);
	}, [restore]);

	useEffect(() => {
		let live = true;
		if(typeof indexedDB === 'undefined')
		{
			setReady(true);
			setStatus('Draft recovery unavailable');
			return;
		}
		void (async () => {
			try
			{
				const scope = location.origin + basePath();
				pointer.current = 'php-editor-session:' + scope;
				storage.current = createEditorRecoveryStore(scope);
				key.current = crypto.randomUUID();
				const previous = await storage.current.read(sessionStorage.getItem(pointer.current));
				if(!live) return;
				if(previous)
				{
					if(previous.documents.some(doc => doc.dirty)) pending.current = previous;
					else
					{
						await restore(previous, false);
						if(previous.pendingRecovery) pending.current = await storage.current.read(previous.pendingRecovery);
					}
					if(live && pending.current)
					{
						setAvailable(true);
						await recover();
					}
				}
				if(live) setStatus('Draft recovery ready');
			}
			catch(error)
			{
				if(live) setStatus('Draft recovery unavailable: ' + error.message);
			}
			finally
			{
				if(live) setReady(true);
			}
		})();
		const store = storage.current;
		return () => {
			live = false;
			void writeQueue.current.finally(() => store?.close()).catch(() => {});
		};
	}, [recover, restore]);

	const flush = useCallback(() => {
		if(!ready || !storage.current || !key.current) return;
		const snapshot = {...editorRecoverySnapshot(current.current), pendingRecovery: pending.current?.key || null};
		const store = storage.current;
		const sessionKey = key.current;
		const storagePointer = pointer.current;
		writeQueue.current = writeQueue.current.catch(() => {}).then(async () => {
			try
			{
				await store.write(sessionKey, snapshot);
				sessionStorage.setItem(storagePointer, sessionKey);
				if(mounted.current) setStatus('Draft recovery saved');
			}
			catch(error)
			{
				if(mounted.current) setStatus('Draft recovery failed: ' + error.message + '. Save or download your edits.');
			}
		});
		return writeQueue.current;
	}, [ready]);
	useEffect(() => {
		const timer = setTimeout(flush, 500);
		return () => clearTimeout(timer);
	}, [workspace.version, workspace.root, workspace.expanded, flush]);
	useEffect(() => {
		const hidden = () => {
			if(document.visibilityState === 'hidden') void flush();
		};
		window.addEventListener('pagehide', flush);
		document.addEventListener('visibilitychange', hidden);
		return () => {
			window.removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', hidden);
		};
	}, [flush]);
	return {ready, status, available, recover, flush};
};
