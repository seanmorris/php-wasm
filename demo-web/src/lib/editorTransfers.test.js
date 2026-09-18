import {droppedEntries, importEntries, pickerEntries, validateTransfer, editorTransferLimits} from './editorTransfers';

it('rejects unsafe paths, duplicate targets and expanded-size limits before writing anything', async () => {
	const adapter = {stat: vi.fn(), write: vi.fn()};
	for(const name of ['/etc/passwd', '../escape', 'a/../b', 'a//b', 'C:/escape', 'a\\b', 'a\0b'])
	{
		await expect(importEntries([{name, bytes: new Uint8Array()}], '/persist', {adapter})).rejects.toThrow();
	}
	expect(() => validateTransfer([{name: 'a'}, {name: 'a/'}])).toThrow('Duplicate');
	expect(() => validateTransfer([{name: 'a'}, {name: 'a/b'}])).toThrow('also used as a folder');
	expect(() => validateTransfer([{name: 'big', size: editorTransferLimits.expanded + 1}])).toThrow('256 MiB');
	expect(adapter.stat).not.toHaveBeenCalled();
	expect(adapter.write).not.toHaveBeenCalled();
});

it('preserves bytes, checks collisions against the observed revision and reports partial failure', async () => {
	const bytes = new Uint8Array([0, 255, 128]);
	const adapter = {
		stat: vi.fn(async path => ({kind: 'directory', exists: path === '/persist'}))
		, inspect: vi.fn(async () => ({exists: true, revision: 'observed'}))
		, mutate: vi.fn(async () => {})
		, write: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('changed concurrently'))
	};
	const ask = vi.fn(async () => ({action: 'replace'}));
	await expect(importEntries([{name: 'folder/first', bytes}, {name: 'second', bytes}], '/persist', {adapter, ask})).rejects.toThrow('1 imported, 0 skipped before failure. changed concurrently');
	expect(adapter.write).toHaveBeenNthCalledWith(1, '/persist/folder/first', bytes, 'observed');
	expect(adapter.mutate).toHaveBeenCalledWith({op: 'mkdir', path: '/persist/folder', expectedRevision: null});
	expect(ask).toHaveBeenCalledTimes(2);
});

it('supports skipping and cancelling remaining collisions without claiming they were written', async () => {
	const adapter = {stat: vi.fn(async () => ({kind: 'directory'})), inspect: vi.fn(async () => ({exists: true})), write: vi.fn()};
	const ask = vi.fn().mockResolvedValueOnce({action: 'skip'}).mockResolvedValueOnce({action: 'cancel'});
	const result = await importEntries([{name: 'a'}, {name: 'b'}, {name: 'c'}], '/persist', {adapter, ask});
	expect(result.message).toBe('0 imported, 1 skipped. Remaining imports cancelled.');
	expect(adapter.write).not.toHaveBeenCalled();
	expect(adapter.inspect).toHaveBeenCalledTimes(2);
});

it('keeps picker paths and traverses every dropped-directory reader page including empty folders', async () => {
	const file = {name: '日本語.bin', webkitRelativePath: 'folder/日本語.bin', size: 3};
	expect(pickerEntries([file])[0]).toEqual({name: 'folder/日本語.bin', file});
	const reader = vi.fn().mockImplementationOnce(resolve => resolve([{name: file.name, isFile: true, file: resolve => resolve(file)}]))
		.mockImplementationOnce(resolve => resolve([{name: 'empty', isDirectory: true, createReader: () => ({readEntries: resolve => resolve([])})}]))
		.mockImplementation(resolve => resolve([]));
	const result = await droppedEntries({items: [{webkitGetAsEntry: () => ({name: 'folder', isDirectory: true, createReader: () => ({readEntries: reader})})}]});
	expect(result.map(entry => entry.name)).toEqual(['folder', 'folder/日本語.bin', 'folder/empty']);
	expect(reader).toHaveBeenCalledTimes(3);
});
