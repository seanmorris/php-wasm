import {editorPath, withinPath} from './editorPaths';

const encoder = new TextEncoder();

/** Decode editable UTF-8 without silently replacing invalid or binary bytes. */
export const decodeEditorFile = bytes => {
	const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
	try
	{
		const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
		if(text.includes('\0')) throw new Error('Binary file');
		return {text, bom, binary: false, eol: text.includes('\r\n') ? 'windows' : 'unix'};
	}
	catch
	{
		return {text: '', bom: false, binary: true, eol: 'unix'};
	}
};

/** Encode the document's current text while retaining its UTF-8 BOM. */
export const encodeEditorFile = (text, bom) => encoder.encode((bom ? '\uFEFF' : '') + text);

/**
 * Own document identity independently of tree rows and asynchronous requests.
 * The injected filesystem speaks the demo editor RPC contract; sessions are Ace-compatible.
 */
export class EditorDocuments
{
	constructor({filesystem, createSession})
	{
		this.filesystem = filesystem;
		this.createSession = createSession;
		this.documents = new Map();
		this.listeners = new Set();
		this.activeId = null;
		this.version = 0;
		this.nextId = 0;
		this.recent = [];
		this.closed = [];
	}

	/** Subscribe to document changes; the returned function removes the listener. */
	subscribe = callback => {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	};

	/** Publish a stable numeric snapshot for React's external-store subscription. */
	emit = () => {
		this.version++;
		for(const callback of this.listeners) callback();
	};

	getSnapshot = () => this.version;
	get active()
	{
		return this.documents.get(this.activeId) ?? null;

	}
	get dirty()
	{
		return [...this.documents.values()].some(doc => doc.dirty);

	}
	get busy()
	{
		return [...this.documents.values()].some(doc => doc.saving);

	}

	/** Look up a document by its current path rather than its original tree row. */
	find(path)
	{
		return [...this.documents.values()].find(doc => doc.path === path);

	}

	/** Allocate a stable document, including untitled documents not yet on disk. */
	create(path = null, text = '')
	{
		const doc = {
			id: `document-${++this.nextId}`
			, path
			, name: path?.split('/').pop() || `Untitled ${this.nextId}`
			, baseline: text, revision: null, dirty: !path, session: null, loading: null
			, saving: null
			, error: null
			, external: null
			, binary: false
			, bom: false
			, eol: 'unix'
			, generation: 0, bytes: null, loaded: !path
		};
		this.documents.set(doc.id, doc);
		if(!path) this.installSession(doc, text);
		return doc;
	}

	/** Bind one session to one document and compare changes with its saved baseline. */
	installSession(doc, text)
	{
		if(doc.session)
		{
			doc.session.off?.('change', doc.onChange);
			doc.session.destroy?.();
		}
		doc.session = this.createSession(text, doc.path);
		doc.session.setNewLineMode?.(doc.eol);
		doc.baseline = doc.session.getValue();
		doc.onChange = () => {
			doc.dirty = !doc.path || doc.session.getValue() !== doc.baseline;
			this.emit();
		};
		doc.session.on('change', doc.onChange);
	}

	/** Select a document without tying asynchronous completion to the selection. */
	select(doc)
	{
		if(!this.documents.has(doc.id)) return;
		this.activeId = doc.id;
		this.emit();
	}

	/** Open or retry a file; late replies populate only the requesting document. */
	async open(path)
	{
		path = editorPath(path);
		const doc = this.find(path) ?? this.create(path);
		this.select(doc);
		this.recent = [path, ...this.recent.filter(item => item !== path)].slice(0, 30);
		if(!doc.loaded) await this.load(doc);
		return doc;
	}

	/** Load a document with generation checks, including close/reload races. */
	load(doc)
	{
		if(doc.loading) return doc.loading;
		const generation = ++doc.generation;
		doc.error = null;
		const path = doc.path;
		doc.loading = Promise.resolve().then(async () => {
			try
			{
				const result = await this.filesystem.read(path);
				if(!this.documents.has(doc.id) || generation !== doc.generation) return;
				const decoded = decodeEditorFile(result.bytes);
				Object.assign(doc, decoded, {bytes: result.bytes, revision: result.revision, external: null, writable: result.writable !== false});
				this.installSession(doc, decoded.text);
				doc.loaded = true;
				doc.dirty = false;
			}
			catch(error)
			{
				if(this.documents.has(doc.id) && generation === doc.generation) doc.error = error;
				throw error;
			}
			finally
			{
				if(generation === doc.generation) doc.loading = null;
				this.emit();
			}
		});
		this.emit();
		return doc.loading;
	}

	/** Save an immutable snapshot; edits made during the write remain dirty. */
	save(doc, {path = doc.path, expectedRevision = doc.revision} = {})
	{
		if(doc.saving) return doc.saving;
		if(!doc.loaded || doc.binary || !doc.session) return Promise.reject(new Error('This document cannot be saved as text.'));
		path = editorPath(path);
		if(this.find(path) && this.find(path) !== doc) return Promise.reject(new Error('That destination is already open in another tab.'));
		const text = doc.session.getValue();
		const bytes = encodeEditorFile(text, doc.bom);
		doc.error = null;
		doc.saving = Promise.resolve().then(async () => {
			try
			{
				const result = await this.filesystem.write(path, bytes, expectedRevision);
				doc.path = path;
				doc.name = path.split('/').pop();
				doc.baseline = text;
				doc.bytes = bytes;
				doc.revision = result.revision;
				doc.writable = true;
				doc.external = null;
				doc.dirty = doc.session.getValue() !== text;
			}
			catch(error)
			{
				doc.error = error;
				throw error;
			}
			finally
			{
				doc.saving = null;
				this.emit();
			}
		});
		this.emit();
		return doc.saving;
	}

	/** Remove a document after the caller has resolved any unsaved-change prompt. */
	close(doc)
	{
		if(doc.saving) throw new Error('Wait for this file to finish saving.');
		doc.generation++;
		this.documents.delete(doc.id);
		doc.session?.off?.('change', doc.onChange);
		doc.session?.destroy?.();
		if(doc.path) this.closed = [doc.path, ...this.closed.filter(path => path !== doc.path)].slice(0, 20);
		if(this.activeId === doc.id) this.activeId = [...this.documents.keys()].at(-1) ?? null;
		this.emit();
	}

	/** Remap an entire subtree without losing dirty buffers or their undo history. */
	move(from, to)
	{
		for(const doc of this.documents.values())
		{
			if(!doc.path || !withinPath(doc.path, from)) continue;
			doc.path = to + doc.path.slice(from.length);
			doc.name = doc.path.split('/').pop();
		}
		this.recent = this.recent.map(path => withinPath(path, from) ? to + path.slice(from.length) : path);
		this.closed = this.closed.map(path => withinPath(path, from) ? to + path.slice(from.length) : path);
		this.emit();
	}
}
