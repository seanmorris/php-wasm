import {editorFilesystem as filesystem} from './editorFilesystem';
import {editorPath, parentPath} from './editorPaths';

export const editorTransferLimits = {compressed: 64 * 1024 * 1024, expanded: 256 * 1024 * 1024, entries: 50000};

/** Validate relative import names before any destination is created. */
export const transferName = name => {
	if(typeof name !== 'string' || !name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes('\\') || name.includes('\0'))
	{
		throw new Error('Import entries must have safe relative names.');
	}
	const parts = name.replace(/\/$/, '').split('/');
	if(parts.some(part => !part || part === '.' || part === '..')) throw new Error('Import names cannot contain empty, . or .. segments.');
	return parts.join('/');
};

/** Reject duplicate names, file/directory collisions and oversized batches as a whole. */
export const validateTransfer = entries => {
	if(entries.length > editorTransferLimits.entries) throw new Error('Import exceeds 50,000 entries.');
	const names = new Map();
	let size = 0;
	for(const entry of entries)
	{
		entry.name = transferName(entry.name);
		if(names.has(entry.name)) throw new Error('Duplicate import path: ' + entry.name);
		names.set(entry.name, entry);
		size += entry.directory ? 0 : (entry.bytes?.byteLength ?? entry.file?.size ?? entry.size ?? 0);
		if(size > editorTransferLimits.expanded) throw new Error('Import exceeds 256 MiB of expanded contents.');
	}
	for(const name of names.keys())
	{
		let parent = name;
		while(parent.includes('/'))
		{
			parent = parent.slice(0, parent.lastIndexOf('/'));
			if(names.has(parent) && !names.get(parent).directory) throw new Error('A file is also used as a folder: ' + parent);
		}
	}
	return entries;
};

/** Collect picker files without losing folder paths or decoding their contents. */
export const pickerEntries = files => validateTransfer([...files].map(file => ({name: file.webkitRelativePath || file.name, file})));

/** Enumerate dropped directory entries, including empty folders and paginated readers. */
export const droppedEntries = async dataTransfer => {
	const roots = [...(dataTransfer.items ?? [])].map(item => item.webkitGetAsEntry?.()).filter(Boolean);
	if(!roots.length) return pickerEntries(dataTransfer.files);
	const entries = [];
	const visit = async (entry, prefix = '') => {
		if(entries.length >= editorTransferLimits.entries) throw new Error('Import exceeds 50,000 entries.');
		const name = prefix + entry.name;
		if(entry.isFile)
		{
			const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
			entries.push({name, file});
		}
		else if(entry.isDirectory)
		{
			entries.push({name, directory: true});
			const reader = entry.createReader();
			let batch;
			do
			{
				batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
				for(const child of batch) await visit(child, name + '/');
			} while(batch.length);
		}
	};
	for(const entry of roots) await visit(entry);
	return validateTransfer(entries);
};

/** Import ordinary entries sequentially, with explicit collision choices and honest progress. */
export const importEntries = async (entries, destination, {ask, progress = () => {}, adapter = filesystem} = {}) => {
	validateTransfer(entries);
	destination = editorPath(destination);
	if((await adapter.stat(destination)).kind !== 'directory') throw new Error('Choose an existing destination folder.');
	const directories = new Set([destination]);
	const ensureDirectory = async path => {
		if(directories.has(path)) return;
		await ensureDirectory(parentPath(path));
		const existing = await adapter.stat(path);
		if(!existing.exists) await adapter.mutate({op: 'mkdir', path, expectedRevision: null});
		else if(existing.kind !== 'directory') throw new Error('A file occupies the destination folder: ' + path);
		directories.add(path);
	};
	let completed = 0, skipped = 0;
	try
	{
		for(const entry of entries)
		{
			const path = editorPath(destination + '/' + entry.name);
			progress(`Importing ${completed + skipped + 1} of ${entries.length}: ${entry.name}`);
			if(entry.directory) await ensureDirectory(path);
			else
			{
				await ensureDirectory(parentPath(path));
				const existing = await adapter.inspect(path);
				if(existing.exists)
				{
					const choice = await ask({title: 'Replace imported file?', message: path, choices: [{action: 'skip', label: 'Skip'}, {action: 'replace', label: 'Replace'}, {action: 'cancel', label: 'Cancel remaining imports'}]});
					if(choice.action === 'cancel') return {message: `${completed} imported, ${skipped} skipped. Remaining imports cancelled.`};
					if(choice.action === 'skip')
					{
						skipped++;
						continue;
					}
				}
				const bytes = entry.bytes ?? new Uint8Array(await entry.file.arrayBuffer());
				await adapter.write(path, bytes, existing.revision);
			}
			completed++;
		}
	}
	catch(error)
	{
		throw new Error(`${completed} imported, ${skipped} skipped before failure. ${error.message || error}`);
	}
	return {message: `${completed} imported, ${skipped} skipped.`};
};

/** Snapshot a folder for ZIP export; binary files are copied without text conversion. */
export const exportEntries = async (path, progress = () => {}) => {
	const entries = [];
	let total = 0;
	const visit = async (directory, prefix = '') => {
		for(const entry of await filesystem.list(directory))
		{
			if(entry.protected || entry.kind === 'special') throw new Error('The folder contains protected or special entries.');
			if(entries.length >= editorTransferLimits.entries) throw new Error('Export exceeds 50,000 entries.');
			const name = prefix + entry.name;
			progress('Preparing ' + name);
			if(entry.kind === 'directory')
			{
				entries.push({name, directory: true});
				await visit(entry.path, name + '/');
			}
			else
			{
				total += entry.size;
				if(total > editorTransferLimits.expanded) throw new Error('Export exceeds 256 MiB.');
				const file = await filesystem.read(entry.path);
				entries.push({name, bytes: file.bytes});
			}
		}
	};
	await visit(path);
	return validateTransfer(entries);
};
