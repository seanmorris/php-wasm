import {editorPath, parentPath, withinPath} from './editorPaths';

const encoder = new TextEncoder();
const fail = (message, code = 'EDITOR_FS') => Object.assign(new Error(message), {code});
// Emscripten accepts numeric O_WRONLY | O_CREAT | O_EXCL, but not the Node "wx" shorthand.
const exclusiveWrite = 1 | 64 | 128;

/** Hash bytes to compare a saved baseline without trusting timestamp resolution. */
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
	.map(byte => byte.toString(16).padStart(2, '0')).join('');

/** Reject symbolic links in any component, including otherwise valid parent directories. */
const safePath = (FS, value) => {
	const path = editorPath(value);
	let current = '';
	for(const part of path.split('/').filter(Boolean))
	{
		current += '/' + part;
		let stat;
		try
		{
			stat = FS.lstat(current);

		}
		catch(error)
		{
			if(error.code === 'ENOENT' || error.errno === 44) continue;
			throw error;
		}
		if(FS.isLink(stat.mode)) throw fail('Symbolic links are not supported by editor file operations.');
	}
	return path;
};

/** Return serializable metadata without attempting to read devices or special files. */
const metadata = (FS, path) => {
	let stat;
	try
	{
		stat = FS.lstat(path);
	}
	catch(error)
	{
		if(error.code === 'ENOENT' || error.errno === 44) return {path, exists: false, revision: null};
		throw error;
	}
	const node = FS.lookupPath(path, {follow: false}).node;
	const kind = FS.isDir(stat.mode) ? 'directory' : FS.isFile(stat.mode) ? 'file' : 'special';
	const protectedEntry = path === '/' || !!node.mounted || node.mount?.mountpoint === path
		|| kind === 'special' || withinPath(path, '/dev') || withinPath(path, '/proc');
	return {
		path, name: path.split('/').pop() || '/', exists: true, kind, size: stat.size
		, modified: Number(stat.mtime)
		, writable: !!(stat.mode & 0o200)
		, protected: protectedEntry
	};
};

/** Read directory entries once, sorting directories before files and then by name. */
const listing = (FS, path) => FS.readdir(path).filter(name => name !== '.' && name !== '..')
	.map(name => metadata(FS, editorPath(path + '/' + name)))
	.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name));

/** Compute a subtree revision for destructive operations and reject special descendants. */
const revision = async (FS, path) => {
	safePath(FS, path);
	const entry = metadata(FS, path);
	if(!entry.exists) return null;
	if(entry.kind === 'file') return digest(FS.readFile(path));
	if(entry.kind !== 'directory') throw fail('This is not a regular file or folder.');
	const children = [];
	for(const child of listing(FS, path))
	{
		if(child.protected) throw fail('This folder contains a protected filesystem entry.');
		children.push([child.name, child.kind, await revision(FS, child.path)]);
	}
	return digest(encoder.encode(JSON.stringify(children)));
};

/** Verify the user's observed disk version while still holding the mutation lock. */
const checkRevision = async (FS, path, expected) => {
	if(expected === undefined) throw fail('A filesystem revision is required.');
	const actual = await revision(FS, path);
	if(actual !== expected) throw fail('The file or folder changed. Refresh it before replacing or deleting it.', 'EDITOR_CONFLICT');
	return actual;
};

/** Remove a preflighted ordinary subtree without traversing symlinks or mount points. */
const remove = (FS, path) => {
	if(metadata(FS, path).kind === 'directory')
	{
		for(const child of listing(FS, path)) remove(FS, child.path);
		FS.rmdir(path);
	}
	else FS.unlink(path);
};

/** Copy a preflighted subtree, preserving bytes and leaving partial outcomes inspectable. */
const copy = (FS, from, to) => {
	if(metadata(FS, from).kind === 'directory')
	{
		FS.mkdir(to);
		for(const child of listing(FS, from)) copy(FS, child.path, to + '/' + child.name);
	}
	else FS.writeFile(to, FS.readFile(from), {flags: exclusiveWrite});
};

/**
 * Execute one checked operation against an already locked, hydrated filesystem.
 * Mutations require expectedRevision (null means the destination must not exist).
 */
export const editorFilesystemOperation = async (FS, request) => {
	const {op, expectedRevision} = request;
	const path = safePath(FS, request.path);
	const entry = metadata(FS, path);
	if(op === 'stat') return entry;
	if(op === 'list')
	{
		if(entry.kind !== 'directory') throw fail('Choose an existing folder.');
		return listing(FS, path);
	}
	if(op === 'inspect') return {...entry, revision: await revision(FS, path)};
	if(op === 'read')
	{
		if(entry.kind !== 'file') throw fail('Choose an existing regular file.');
		const bytes = FS.readFile(path);
		return {...entry, bytes, revision: await digest(bytes)};
	}
	if(!['write', 'create', 'mkdir', 'move', 'copy', 'delete'].includes(op)) throw fail('Unknown editor filesystem operation.');
	if(entry.protected || withinPath(path, '/dev') || withinPath(path, '/proc')) throw fail('Filesystem roots, mount points and special files are protected.');
	if(metadata(FS, parentPath(path)).kind !== 'directory') throw fail('The parent folder does not exist.');
	await checkRevision(FS, path, expectedRevision);
	if(op === 'write' || op === 'create')
	{
		if(entry.exists && entry.kind !== 'file') throw fail('A folder already occupies this path.');
		if(op === 'create' && entry.exists) throw fail('This file already exists.', 'EDITOR_CONFLICT');
		const bytes = op === 'create' ? new Uint8Array() : request.bytes;
		if(!(bytes instanceof Uint8Array)) throw fail('File contents must be bytes.');
		FS.writeFile(path, bytes, {flags: entry.exists ? 'w' : exclusiveWrite});
		return {path, revision: await digest(bytes)};
	}
	if(op === 'mkdir')
	{
		if(entry.exists) throw fail('This path already exists.', 'EDITOR_CONFLICT');
		FS.mkdir(path);
		return {path};
	}
	if(!entry.exists) throw fail('This file or folder no longer exists.', 'EDITOR_CONFLICT');
	if(op === 'delete')
	{
		remove(FS, path);
		return {path};
	}
	const destination = safePath(FS, request.destination);
	if(withinPath(destination, path)) throw fail('A folder cannot be copied or moved into itself.');
	if(metadata(FS, destination).exists) throw fail('The destination already exists. Choose another name.', 'EDITOR_CONFLICT');
	if(metadata(FS, parentPath(destination)).kind !== 'directory') throw fail('The destination folder does not exist.');
	if(withinPath(destination, '/dev') || withinPath(destination, '/proc')) throw fail('This destination is protected.');
	if(op === 'move') FS.rename(path, destination);
	else copy(FS, path, destination);
	return {path, destination};
};

/** Register the demo-only RPC without extending public php-wasm package APIs. */
export const createEditorFilesystemActions = ({withLock}) => ({
	editorFilesystem: (php, request) => withLock(async () => {
		const readOnly = ['stat', 'list', 'inspect', 'read'].includes(request.op);
		const result = await php._enqueue(async () => editorFilesystemOperation((await php.binary).FS, request), [], readOnly);
		if(!readOnly && globalThis.clients)
		{
			try
			{
				const clients = await globalThis.clients.matchAll({type: 'window', includeUncontrolled: true});
				for(const client of clients) client.postMessage({type: 'editor-filesystem-change', operation: request.op, path: request.path, destination: request.destination});
			}
			catch(error)
			{
				console.warn('Editor notification failed after filesystem commit:', error);
			}
		}
		return result;
	})
});
