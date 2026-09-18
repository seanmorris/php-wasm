import {EditorDocuments, decodeEditorFile, encodeEditorFile} from './EditorDocuments';

const deferred = () => {
	let resolve, reject;
	const promise = new Promise((a, r) => {
		resolve = a;
		reject = r;
	});
	return {promise, resolve, reject};
};

const setup = () => {
	const filesystem = {
		read: vi.fn(async path => ({bytes: new TextEncoder().encode(path), revision: 'original'}))
		, write: vi.fn(async () => ({revision: 'saved'}))
	};
	const createSession = value => {
		let change;
		return {
			getValue: () => value
			, setValue: next => {
				value = next;
				change?.();
			}
			, on: (_event, callback) => change = callback
			, off: () => change = null
		};
	};
	return {filesystem, model: new EditorDocuments({filesystem, createSession})};
};

it('keeps late file contents bound to their document after switching tabs', async () => {
	const {model, filesystem} = setup();
	const b = await model.open('/b.php');
	const pending = deferred();
	filesystem.read.mockReturnValueOnce(pending.promise);
	const opening = model.open('/a.php');
	await model.open('/b.php');
	pending.resolve({bytes: new TextEncoder().encode('A'), revision: 'a'});
	await opening;
	expect(model.active).toBe(b);
	expect(model.active.session.getValue()).toBe('/b.php');
	await model.save(b);
	expect(filesystem.write.mock.calls[0][0]).toBe('/b.php');
	expect(new TextDecoder().decode(filesystem.write.mock.calls[0][1])).toBe('/b.php');
});

it('retains dirty contents after failure and after editing during a successful save', async () => {
	const {model, filesystem} = setup();
	const doc = await model.open('/a');
	doc.session.setValue('edited');
	filesystem.write.mockRejectedValueOnce(new Error('quota'));
	await expect(model.save(doc)).rejects.toThrow('quota');
	expect(doc.dirty).toBe(true);
	const pending = deferred();
	filesystem.write.mockReturnValueOnce(pending.promise);
	const saving = model.save(doc);
	doc.session.setValue('edited again');
	pending.resolve({revision: 'new'});
	await saving;
	expect(doc.dirty).toBe(true);
	expect(doc.baseline).toBe('edited');
	doc.session.setValue('edited');
	expect(doc.dirty).toBe(false);
});

it('retries failed opens and discards replies for closed documents', async () => {
	const {model, filesystem} = setup();
	filesystem.read.mockRejectedValueOnce(new Error('missing'));
	await expect(model.open('/a')).rejects.toThrow('missing');
	expect(model.active.loading).toBe(null);
	await model.open('/a');
	expect(model.active.loaded).toBe(true);
	const pending = deferred();
	filesystem.read.mockReturnValueOnce(pending.promise);
	const opening = model.open('/b');
	model.close(model.active);
	pending.resolve({bytes: new TextEncoder().encode('late'), revision: 'b'});
	await opening;
	expect(model.find('/b')).toBeUndefined();
	expect(model.active.path).toBe('/a');
});

it('preserves buffer identity through a directory move and saves to the new path', async () => {
	const {model, filesystem} = setup();
	const doc = await model.open('/old/a.php');
	doc.session.setValue('draft');
	const session = doc.session;
	model.move('/old', '/new');
	expect(model.find('/old/a.php')).toBeUndefined();
	expect(model.find('/new/a.php')).toBe(doc);
	expect(doc.session).toBe(session);
	expect(doc.dirty).toBe(true);
	await model.save(doc);
	expect(filesystem.write.mock.calls[0][0]).toBe('/new/a.php');
});

it('prevents overlapping saves, closing during a save, and duplicate Save As destinations', async () => {
	const {model, filesystem} = setup();
	const a = await model.open('/a');
	await model.open('/b');
	await expect(model.save(a, {path: '/b'})).rejects.toThrow('already open');
	const pending = deferred();
	filesystem.write.mockReturnValueOnce(pending.promise);
	const save = model.save(a);
	expect(model.save(a)).toBe(save);
	expect(() => model.close(a)).toThrow('finish saving');
	pending.resolve({revision: 'saved'});
	await save;
});

it('preserves BOM and CRLF and never decodes binary data as editable replacement text', () => {
	const bytes = encodeEditorFile('a\r\nb\r\n', true);
	expect(decodeEditorFile(bytes)).toEqual({text: 'a\r\nb\r\n', bom: true, binary: false, eol: 'windows'});
	expect(decodeEditorFile(new Uint8Array([0xff, 0xfe, 0])) .binary).toBe(true);
	expect(decodeEditorFile(new Uint8Array([65, 0, 66])).binary).toBe(true);
});

it('clears pending state even when an adapter throws before returning a promise', async () => {
	const {model, filesystem} = setup();
	filesystem.read.mockImplementationOnce(() => {
		throw new Error('synchronous read failure');
	});
	await expect(model.open('/a')).rejects.toThrow('synchronous read failure');
	expect(model.active.loading).toBeNull();
	const doc = await model.open('/a');
	filesystem.write.mockImplementationOnce(() => {
		throw new Error('synchronous write failure');
	});
	doc.session.setValue('draft');
	await expect(model.save(doc)).rejects.toThrow('synchronous write failure');
	expect(doc.saving).toBeNull();
	expect(doc.dirty).toBe(true);
});
