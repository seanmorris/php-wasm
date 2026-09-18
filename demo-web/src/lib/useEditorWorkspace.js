import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {EditorDocuments} from './EditorDocuments';
import {editorFilesystem as filesystem} from './editorFilesystem';
import {childPath, editorPath, parentPath, withinPath} from './editorPaths';
import {useEditorDialog} from '../components/EditorDialog';

const cancel = {action: 'cancel', label: 'Cancel'};
export const editorErrorMessage = error => error?.message || error?.error || String(error);

/** Own editor commands, selection, operation status, and user decisions in one place. */
export const useEditorWorkspace = ({createSession, onMove, onDelete}) => {
	const modelRef = useRef(null);
	if(!modelRef.current) modelRef.current = new EditorDocuments({filesystem, createSession});
	const model = modelRef.current;
	const version = useSyncExternalStore(model.subscribe, model.getSnapshot);
	const {ask, dialog, finish} = useEditorDialog();
	const [root, setRoot] = useState('/');
	const [expanded, setExpanded] = useState(new Set(['/']));
	const [selected, setSelected] = useState(new Set());
	const [selectedEntry, setSelectedEntry] = useState(null);
	const [refresh, setRefresh] = useState(0);
	const [busy, setBusy] = useState(null);
	const [status, setStatus] = useState('Ready. Save writes files; draft recovery does not.');
	const [error, setError] = useState(null);
	const operation = useRef(null);
	const pendingMoves = useRef([]);
	const clipboard = useRef(null);
	const openRequest = useRef(0);
	const navigationApproved = useRef(false);
	const moveRef = useRef(onMove);
	moveRef.current = onMove;
	const deleteRef = useRef(onDelete);
	deleteRef.current = onDelete;
	const invalidate = useCallback(() => setRefresh(value => value + 1), []);
	const directory = selectedEntry?.kind === 'directory' ? selectedEntry.path : selectedEntry ? parentPath(selectedEntry.path) : root;

	/** Keep every path-based view in step with a successful subtree move. */
	const remapPaths = useCallback((from, to) => {
		const remap = path => withinPath(path, from) ? to + path.slice(from.length) : path;
		model.move(from, to);
		setRoot(remap);
		setExpanded(paths => new Set([...paths].map(remap)));
		setSelected(paths => new Set([...paths].map(remap)));
		setSelectedEntry(entry => entry ? {...entry, path: remap(entry.path), name: remap(entry.path).split('/').pop() || '/'} : null);
		moveRef.current?.(from, to);
	}, [model]);

	/** Keep one mutation active; slow replies retain their original completion handling. */
	const perform = useCallback(async (label, callback) => {
		if(operation.current) return false;
		const token = {};
		operation.current = token;
		setBusy(label);
		setError(null);
		setStatus(label + '…');
		const slow = setTimeout(() => {
			if(operation.current === token) setStatus(label + ' is still pending. Its outcome is unknown; keep this page open and do not repeat the operation.');
		}, 15000);
		try
		{
			const result = await callback();
			if(result !== false) setStatus(result?.message || label + ' completed.');
			else setStatus('Cancelled.');
			return result;
		}
		catch(failure)
		{
			setError({label, message: editorErrorMessage(failure), code: failure?.code});
			setStatus(label + ' failed. Edits have been retained.');
			invalidate();
			return false;
		}
		finally
		{
			clearTimeout(slow);
			operation.current = null;
			setBusy(null);
			for(const change of pendingMoves.current.splice(0)) remapPaths(change.path, change.destination);
		}
	}, [invalidate, remapPaths]);

	const promptPath = async (title, value) => {
		const answer = await ask({title, label: 'Filesystem path', value, validate: editorPath, choices: [{action: 'accept', label: 'Continue'}, cancel]});
		return answer.action === 'accept' ? editorPath(answer.value) : null;
	};

	/** Expand a path's ancestors so selection and the active tab remain locatable. */
	const reveal = useCallback(path => {
		if(!path) return;
		setExpanded(previous => {
			const next = new Set(previous);
			let dir = parentPath(path);
			while(dir)
			{
				next.add(dir);
				if(dir === '/') break;
				dir = parentPath(dir);
			}
			return next;
		});
		setSelected(new Set([path]));
	}, []);

	const openFile = useCallback(async path => {
		const request = ++openRequest.current;
		try
		{
			path = editorPath(path);
			if(!model.find(path)?.loaded)
			{
				const info = await filesystem.stat(path);
				if(request !== openRequest.current) return null;
				if(info.kind === 'directory')
				{
					setRoot(path);
					setExpanded(new Set([path]));
					setSelected(new Set([path]));
					setSelectedEntry(info);
					return null;
				}
				if(info.size > 2 * 1024 * 1024)
				{
					const result = await ask({title: 'Open large file?', message: `${path} is ${(info.size / 1048576).toFixed(1)} MiB. Loading it may take time.`, choices: [{action: 'open', label: 'Open'}, cancel]});
					if(result.action !== 'open') return null;
				}
			}
			if(request !== openRequest.current) return null;
			const pending = model.open(path);
			setSelectedEntry({path, name: path.split('/').pop(), kind: 'file'});
			reveal(path);
			return await pending;
		}
		catch(failure)
		{
			if(request !== openRequest.current) return null;
			setError({label: 'Open file', message: editorErrorMessage(failure)});
			return null;
		}
	}, [ask, model, reveal]);

	/** Resolve overwrite decisions before using the exact inspected destination revision. */
	const saveDocument = async (doc, saveAs = false) => {
		if(!doc) return false;
		const previousPath = doc.path;
		let path = doc.path;
		let expectedRevision = doc.revision;
		if(saveAs || !path)
		{
			path = await promptPath('Save As', path || childPath(directory === '/' ? '/persist' : directory, 'untitled.php'));
			if(!path) return false;
			const destination = await filesystem.inspect(path);
			if(path !== doc.path) expectedRevision = destination.revision;
			if(destination.exists && path !== doc.path)
			{
				const choice = await ask({title: 'Replace existing file?', message: path, choices: [{action: 'replace', label: 'Replace'}, cancel]});
				if(choice.action !== 'replace') return false;
			}
		}
		try
		{
			await model.save(doc, {path, expectedRevision});

		}
		catch(failure)
		{
			if(failure?.code !== 'EDITOR_CONFLICT') throw failure;
			doc.external = 'changed';
			model.emit();
			const current = await filesystem.inspect(path);
			const choice = await ask({title: 'File changed on disk', message: `${path} changed or was deleted. Your edits are still available.`, choices: [{action: 'save-as', label: 'Save As'}, {action: 'reload', label: 'Reload and discard edits'}, {action: 'overwrite', label: 'Overwrite disk version'}, cancel]});
			if(choice.action === 'save-as') return saveDocument(doc, true);
			if(choice.action === 'reload')
			{
				await model.load(doc);
				return false;
			}
			if(choice.action !== 'overwrite') return false;
			await model.save(doc, {path, expectedRevision: current.revision});
		}
		if(previousPath && previousPath !== doc.path) moveRef.current?.(previousPath, doc.path);
		reveal(doc.path);
		setSelectedEntry({path: doc.path, name: doc.name, kind: 'file'});
		invalidate();
		return true;
	};

	const saveAll = async () => {
		const failed = [];
		for(const doc of model.documents.values())
		{
			if(!doc.dirty) continue;
			try
			{
				if(!await saveDocument(doc) || doc.dirty) failed.push(doc.name + ': contains unsaved edits');

			}
			catch(failure)
			{
				failed.push(doc.name + ': ' + editorErrorMessage(failure));
			}
		}
		if(failed.length) throw new Error(failed.join('\n'));
		if(model.dirty) throw new Error('New edits were made while saving. Save again before continuing.');
		return true;
	};

	/** Save/discard/cancel decisions are shared by closing tabs and leaving the editor. */
	const guard = async (documents = [...model.documents.values()]) => {
		const dirty = documents.filter(doc => doc.dirty);
		if(!dirty.length) return true;
		const choice = await ask({title: 'Unsaved changes', message: dirty.map(doc => doc.path || doc.name).join('\n'), choices: [{action: 'save', label: 'Save'}, {action: 'discard', label: 'Discard'}, cancel]});
		if(choice.action === 'cancel') return false;
		if(choice.action === 'save')
		{
			for(const doc of dirty) if(!await saveDocument(doc) || doc.dirty) return false;
			if(documents.some(doc => doc.dirty)) throw new Error('New edits were made while saving. Save again before continuing.');
		}
		if(choice.action === 'discard')
		{
			for(const doc of dirty) doc.dirty = false;
			model.emit();
		}
		return true;
	};

	const closeDocuments = docs => perform('Close files', async () => {
		if(!await guard(docs)) return false;
		for(const doc of docs) model.close(doc);
		return true;
	});
	const newDocument = () => {
		const doc = model.create();
		model.select(doc);
	};
	const newEntry = folder => perform(folder ? 'Create folder' : 'Create file', async () => {
		const choice = await ask({title: folder ? 'New Folder' : 'New File', label: folder ? 'Folder name' : 'File name', value: '', validate: name => childPath(directory, name), choices: [{action: 'create', label: 'Create'}, cancel]});
		if(choice.action !== 'create') return false;
		const path = childPath(directory, choice.value);
		await filesystem.mutate({op: folder ? 'mkdir' : 'create', path, expectedRevision: null});
		setExpanded(previous => new Set([...previous, directory]));
		invalidate();
		if(!folder) await openFile(path);
		return true;
	});

	const rename = entry => perform('Rename', async () => {
		const before = await filesystem.inspect(entry.path);
		const choice = await ask({title: 'Rename', label: 'New name', value: entry.path.split('/').pop(), validate: name => childPath(parentPath(entry.path), name), choices: [{action: 'rename', label: 'Rename'}, cancel]});
		if(choice.action !== 'rename') return false;
		const destination = childPath(parentPath(entry.path), choice.value);
		if(destination === entry.path) return false;
		await filesystem.mutate({op: 'move', path: entry.path, destination, expectedRevision: before.revision});
		remapPaths(entry.path, destination);
		setSelected(new Set([destination]));
		setSelectedEntry({...entry, path: destination, name: choice.value});
		reveal(destination);
		invalidate();
		return true;
	});

	const selectedPaths = () => [...selected].filter(path => ![...selected].some(other => other !== path && withinPath(path, other)));
	const removeSelected = () => perform('Delete', async () => {
		const paths = selectedPaths();
		if(!paths.length) return false;
		const inspected = await Promise.all(paths.map(path => filesystem.inspect(path)));
		const affected = [...model.documents.values()].filter(doc => doc.path && paths.some(path => withinPath(doc.path, path)));
		const choice = await ask({title: 'Delete permanently?', message: paths.join('\n') + (affected.some(doc => doc.dirty) ? '\nUnsaved edits in these files will also be discarded. Use Save As first to keep them.' : ''), choices: [{action: 'delete', label: 'Delete'}, cancel]});
		if(choice.action !== 'delete') return false;
		let completed = 0;
		try
		{
			for(const entry of inspected)
			{
				await filesystem.mutate({op: 'delete', path: entry.path, expectedRevision: entry.revision});
				for(const doc of affected.filter(doc => withinPath(doc.path, entry.path))) model.close(doc);
				deleteRef.current?.(entry.path);
				setRoot(root => withinPath(root, entry.path) ? parentPath(entry.path) : root);
				completed++;
			}
		}
		catch(failure)
		{
			throw new Error(`${completed} of ${paths.length} entries deleted. ${editorErrorMessage(failure)}`);
		}
		finally
		{
			invalidate();
			setSelected(new Set());
			setSelectedEntry(null);
		}
		return true;
	});

	/** Copy/cut snapshots retain the observed source revisions until Paste. */
	const copySelection = cut => perform(cut ? 'Cut selection' : 'Copy selection', async () => {
		clipboard.current = {cut, entries: await Promise.all(selectedPaths().map(path => filesystem.inspect(path)))};
		return true;
	});
	const transfer = async (entries, destination, cut) => {
		let completed = 0;
		try
		{
			for(const entry of entries)
			{
				let target = childPath(destination, entry.name);
				if(target === entry.path || (await filesystem.stat(target)).exists)
				{
					target = await promptPath('Choose a different destination', target + ' copy');
					if(!target) return false;
				}
				await filesystem.mutate({op: cut ? 'move' : 'copy', path: entry.path, destination: target, expectedRevision: entry.revision});
				if(cut)
				{
					remapPaths(entry.path, target);
				}
				completed++;
			}
		}
		catch(failure)
		{
			throw new Error(`${completed} of ${entries.length} entries completed. ${editorErrorMessage(failure)}`);
		}
		finally
		{
			invalidate();
		}
		return true;
	};
	const paste = () => perform('Paste', async () => {
		if(!clipboard.current) return false;
		const item = clipboard.current;
		if(item.cut) clipboard.current = null;
		return transfer(item.entries, directory, item.cut);
	});
	const moveSelection = () => perform('Move', async () => {
		const target = await promptPath('Move into folder', directory);
		if(!target) return false;
		return transfer(await Promise.all(selectedPaths().map(path => filesystem.inspect(path))), target, true);
	});
	const duplicate = entry => perform('Duplicate', async () => {
		return transfer([await filesystem.inspect(entry.path)], parentPath(entry.path), false);
	});

	const checkExternal = useCallback(async () => {
		invalidate();
		if(operation.current) return;
		for(const doc of model.documents.values())
		{
			if(!doc.path || !doc.loaded || doc.loading || doc.saving) continue;
			const {path, revision, generation} = doc;
			try
			{
				const state = await filesystem.inspect(path);
				if(operation.current || doc.saving || doc.loading || doc.path !== path || doc.revision !== revision || doc.generation !== generation || !model.documents.has(doc.id)) continue;
				doc.external = state.revision !== revision ? state.exists ? 'changed' : 'deleted' : null;
			}
			catch(failure)
			{
				setError({label: 'Refresh', message: editorErrorMessage(failure)});
			}
		}
		model.emit();
	}, [invalidate, model]);

	useEffect(() => {
		let controller = navigator.serviceWorker?.controller;
		const beforeUnload = event => {
			if(navigationApproved.current)
			{
				navigationApproved.current = false;
				return;
			}
			if(model.dirty || operation.current || model.busy)
			{
				event.preventDefault();
				event.returnValue = '';
			}
		};
		const changed = event => {
			if(event.data?.type !== 'editor-filesystem-change') return;
			if(event.data.operation === 'move')
			{
				if(operation.current) pendingMoves.current.push(event.data);
				else remapPaths(event.data.path, event.data.destination);
			}
			if(event.data.operation === 'delete') deleteRef.current?.(event.data.path);
			void checkExternal();
		};
		const controllerChanged = () => {
			if(controller && operation.current) setError({label: 'Worker changed', message: 'The filesystem worker changed. Pending writes may have completed. Keep your edits and refresh to reconcile the filesystem before retrying.'});
			controller = navigator.serviceWorker?.controller;
			void checkExternal();
		};
		window.addEventListener('beforeunload', beforeUnload);
		window.addEventListener('focus', checkExternal);
		navigator.serviceWorker?.addEventListener?.('message', changed);
		navigator.serviceWorker?.addEventListener?.('controllerchange', controllerChanged);
		return () => {
			window.removeEventListener('beforeunload', beforeUnload);
			window.removeEventListener('focus', checkExternal);
			navigator.serviceWorker?.removeEventListener?.('message', changed);
			navigator.serviceWorker?.removeEventListener?.('controllerchange', controllerChanged);
		};
	}, [checkExternal, model, remapPaths]);

	return {
		model
		, version
		, ask
		, dialog
		, finish
		, root
		, setRoot
		, expanded
		, setExpanded
		, selected
		, selectedEntry
		, directory
		, refresh
		, invalidate
		, busy
		, status
		, setStatus
		, error
		, setError
		, perform
		, promptPath
		, reveal
		, openFile
		, saveDocument
		, saveAll
		, guard
		, closeDocuments
		, newDocument
		, newEntry
		, rename
		, removeSelected
		, copySelection
		, paste
		, moveSelection
		, duplicate
		, checkExternal, transfer
		, allowNavigationOnce() {
			navigationApproved.current = true;
		}
		, selectDocument(doc) {
			openRequest.current++;
			model.select(doc);
			if(doc.path)
			{
				setSelectedEntry({path: doc.path, name: doc.name, kind: 'file'});
				reveal(doc.path);
			}
		}
		, select(entry, multiple) {
			setSelectedEntry(entry);
			setSelected(previous => {
				if(!multiple) return new Set([entry.path]);
				const next = new Set(previous);
				if(next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
				return next;
			});
		}
		, expand(path, value) {
			setExpanded(previous => {
				const next = new Set(previous);
				if(value) next.add(path); else next.delete(path);
				return next;
			});
		}
		, async changeRoot() {
			return perform('Choose explorer root', async () => {
				const path = await promptPath('Explorer root', root);
				if(!path) return false;
				if((await filesystem.stat(path)).kind !== 'directory') throw new Error('Choose an existing folder.');
				setRoot(path); setExpanded(new Set([path])); setSelected(new Set([path])); setSelectedEntry({path, kind: 'directory', name: path.split('/').pop() || '/'}); return true;
			});
		}
		, revert(doc) {
			return perform('Revert', async () => {
				if(!doc?.path || !await guard([doc])) return false;
				await model.load(doc);
				return true;
			});
		}
	};
};
