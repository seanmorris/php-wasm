import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import {editorFilesystemOperation} from './editorFilesystem.worker';

let root, FS;
beforeEach(() => {
	vi.stubGlobal('crypto', webcrypto);
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'php-editor-fs-'));
	const local = value => path.join(root, value);
	fs.mkdirSync(local('/persist'));
	fs.mkdirSync(local('/dev'));
	FS = {
		analyzePath: value => ({exists: fs.existsSync(local(value))})
		, lstat: value => fs.lstatSync(local(value))
		, lookupPath: value => ({node: {mounted: value === '/persist', mount: {mountpoint: '/'}}})
		, isDir: mode => (mode & 0o170000) === 0o040000
		, isFile: mode => (mode & 0o170000) === 0o100000
		, isLink: mode => (mode & 0o170000) === 0o120000
		, readdir: value => fs.readdirSync(local(value))
		, readFile: value => new Uint8Array(fs.readFileSync(local(value)))
		, writeFile: (value, bytes, options) => fs.writeFileSync(local(value), bytes, {flag: options?.flags ?? 'w'})
		, mkdir: value => fs.mkdirSync(local(value))
		, rmdir: value => fs.rmdirSync(local(value))
		, unlink: value => fs.unlinkSync(local(value))
		, rename: (from, to) => fs.renameSync(local(from), local(to))
	};
});
afterEach(() => {
	fs.rmSync(root, {recursive: true, force: true});
	vi.unstubAllGlobals();
});
const operation = request => editorFilesystemOperation(FS, request);
const write = (name, contents) => FS.writeFile(name, new TextEncoder().encode(contents));

it('rejects collisions and changed content even when the file length is unchanged', async () => {
	write('/persist/a', 'old');
	const original = await operation({op: 'read', path: '/persist/a'});
	await expect(operation({op: 'create', path: '/persist/a', expectedRevision: null})).rejects.toMatchObject({code: 'EDITOR_CONFLICT'});
	write('/persist/a', 'new');
	await expect(operation({op: 'write', path: '/persist/a', expectedRevision: original.revision, bytes: new TextEncoder().encode('replacement')})).rejects.toMatchObject({code: 'EDITOR_CONFLICT'});
	expect(new TextDecoder().decode(FS.readFile('/persist/a'))).toBe('new');
});

it('writes new files exclusively and returns their new revision', async () => {
	const saved = await operation({op: 'write', path: '/persist/new', expectedRevision: null, bytes: new Uint8Array([0, 255, 128])});
	const read = await operation({op: 'read', path: '/persist/new'});
	expect(read.revision).toBe(saved.revision);
	expect([...read.bytes]).toEqual([0, 255, 128]);
});

it('lists a dangling symlink as a protected entry without following it or breaking the folder', async () => {
	fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'persist/dangling'));
	write('/persist/regular', 'text');
	const entries = await operation({op: 'list', path: '/persist'});
	expect(entries.find(entry => entry.name === 'dangling')).toMatchObject({kind: 'special', protected: true});
	expect(entries.find(entry => entry.name === 'regular')).toMatchObject({kind: 'file'});
});

it('preflights recursive mutations, detects changed children and preserves binary copies', async () => {
	FS.mkdir('/persist/folder');
	FS.writeFile('/persist/folder/a', new Uint8Array([0, 255]));
	const initial = await operation({op: 'inspect', path: '/persist/folder'});
	write('/persist/folder/b', 'added');
	await expect(operation({op: 'delete', path: '/persist/folder', expectedRevision: initial.revision})).rejects.toMatchObject({code: 'EDITOR_CONFLICT'});
	const current = await operation({op: 'inspect', path: '/persist/folder'});
	await operation({op: 'copy', path: '/persist/folder', destination: '/persist/copy', expectedRevision: current.revision});
	expect([...FS.readFile('/persist/copy/a')]).toEqual([0, 255]);
	await operation({op: 'move', path: '/persist/folder', destination: '/persist/moved', expectedRevision: current.revision});
	expect(FS.analyzePath('/persist/folder').exists).toBe(false);
	await operation({op: 'delete', path: '/persist/moved', expectedRevision: current.revision});
	expect(FS.analyzePath('/persist/moved').exists).toBe(false);
});

it('rejects traversal, symlink parents, dangling symlinks, mount deletion and protected writes', async () => {
	fs.symlinkSync(path.join(root, 'persist'), path.join(root, 'link'));
	fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'dangling'));
	for(const target of ['/persist/../escape', '/link/file', '/dangling/file', '/dev/file'])
	{
		await expect(operation({op: 'create', path: target, expectedRevision: null})).rejects.toBeDefined();
	}
	await expect(operation({op: 'delete', path: '/persist', expectedRevision: null})).rejects.toThrow('protected');
});

it('rejects self-descendant moves and copying over an existing destination', async () => {
	FS.mkdir('/persist/folder');
	const current = await operation({op: 'inspect', path: '/persist/folder'});
	await expect(operation({op: 'move', path: current.path, destination: '/persist/folder/child', expectedRevision: current.revision})).rejects.toThrow('itself');
	FS.mkdir('/persist/existing');
	await expect(operation({op: 'copy', path: current.path, destination: '/persist/existing', expectedRevision: current.revision})).rejects.toMatchObject({code: 'EDITOR_CONFLICT'});
});
