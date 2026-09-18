/** Canonical paths shared by editor commands and the worker filesystem adapter. */
export const editorPath = value => {
	if(typeof value !== 'string' || !value.startsWith('/') || value.includes('\0') || value.includes('\\'))
	{
		throw new Error('Choose an absolute filesystem path.');
	}
	const parts = value.split('/').filter(Boolean);
	if(parts.some(part => part === '.' || part === '..'))
	{
		throw new Error('Paths cannot contain . or .. segments.');
	}
	return '/' + parts.join('/');
};

/** Test containment on path boundaries, including the filesystem root. */
export const withinPath = (path, root) => path === root || path.startsWith(root === '/' ? '/' : root + '/');

/** Return the containing directory of a canonical path. */
export const parentPath = path => path.slice(0, path.lastIndexOf('/')) || '/';

/** Validate one new entry name without allowing implicit moves. */
export const childPath = (parent, name) => {
	if(!name || name.includes('/') || name === '.' || name === '..')
	{
		throw new Error('Enter a file or folder name without slashes.');
	}
	return editorPath(parent + '/' + name);
};

/** Determine whether an entry is stored in one of the demo's persistent mounts. */
export const isPersistentPath = path => !!path && ['/persist', '/config'].some(root => withinPath(path, root));
