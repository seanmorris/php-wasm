import {act, renderHook, waitFor} from '@testing-library/react';
import {useSyncExternalStore} from 'react';
import {EditorDocuments} from './EditorDocuments';
import {editorRecoverySnapshot} from './editorRecovery';
import {useEditorRecovery} from './useEditorRecovery';

const {store, filesystem} = vi.hoisted(() => ({
	store: {read: vi.fn(), write: vi.fn(), remove: vi.fn(), close: vi.fn()}
	, filesystem: {inspect: vi.fn(), read: vi.fn(), write: vi.fn()}
}));
vi.mock('./editorRecovery', async original => ({...await original(), createEditorRecoveryStore: () => store}));
vi.mock('./editorFilesystem', () => ({editorFilesystem: filesystem}));
vi.mock('./runtimePaths', () => ({basePath: () => '/php-wasm/'}));

const snapshot = {
	key: 'previous'
	, format: 1
	, root: '/persist'
	, expanded: ['/', '/persist']
	, activeId: 'old'
	, recent: ['/persist/a.php']
	, documents: [{id: 'old', path: '/persist/a.php', name: 'a.php', dirty: true, text: 'recovered draft', baseline: 'original', revision: 'original', bom: true, eol: 'windows'}]
};
const workspace = choice => {
	const model = new EditorDocuments({filesystem, createSession: text => ({getValue: () => text, on() {}, setNewLineMode() {}})});
	return {model, root: '/', expanded: new Set(['/']), setRoot: vi.fn(), setExpanded: vi.fn(), ask: vi.fn(async () => ({action: choice})), openFile: path => model.open(path)};
};
const mount = w => renderHook(() => {
	const version = useSyncExternalStore(w.model.subscribe, w.model.getSnapshot);
	return useEditorRecovery({...w, version});
});

beforeEach(() => {
	vi.stubGlobal('indexedDB', {});
	sessionStorage.clear();
	sessionStorage.setItem('php-editor-session:' + location.origin + '/php-wasm/', 'previous');
	for(const mock of Object.values(store)) mock.mockReset();
	for(const mock of Object.values(filesystem)) mock.mockReset();
	store.read.mockResolvedValue(snapshot);
	store.write.mockResolvedValue();
	filesystem.inspect.mockResolvedValue({exists: true, revision: 'changed-on-disk'});
	filesystem.read.mockResolvedValue({bytes: new TextEncoder().encode('disk'), revision: 'changed-on-disk'});
});
afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.clear();
});

it('recovers a separate dirty buffer and warns of a changed disk baseline without writing PHP files', async () => {
	const w = workspace('recover');
	const {result} = mount(w);
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(w.model.active.session.getValue()).toBe('recovered draft');
	expect(w.model.active).toMatchObject({dirty: true, bom: true, eol: 'windows', external: 'changed', revision: 'original'});
	expect(filesystem.write).not.toHaveBeenCalled();
	await act(() => result.current.flush());
	expect(store.write).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({documents: [expect.objectContaining({text: 'recovered draft', dirty: true})]}));
	expect(store.write.mock.calls[0][0]).not.toBe('previous');
});

it('keeps deferred recovery discoverable on the next reload', async () => {
	const w = workspace('cancel');
	const {result} = mount(w);
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(result.current.available).toBe(true);
	expect(w.model.documents.size).toBe(0);
	await act(() => result.current.flush());
	expect(store.write).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({pendingRecovery: 'previous'}));
	expect(store.remove).not.toHaveBeenCalled();
});

it('discards a saved recovery draft only after the explicit choice and reopens current disk contents', async () => {
	const w = workspace('discard');
	const {result} = mount(w);
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(w.model.active.session.getValue()).toBe('disk');
	expect(store.remove).toHaveBeenCalledWith('previous');
	expect(filesystem.write).not.toHaveBeenCalled();
	expect(editorRecoverySnapshot(w).documents[0]).not.toHaveProperty('text');
});

it('keeps editing available and surfaces failed recovery storage writes', async () => {
	const w = workspace('recover');
	const {result} = mount(w);
	await waitFor(() => expect(result.current.ready).toBe(true));
	store.write.mockRejectedValue(new Error('quota exceeded'));
	await act(() => result.current.flush());
	expect(result.current.status).toContain('quota exceeded');
	expect(w.model.active.dirty).toBe(true);
	expect(w.model.active.session.getValue()).toBe('recovered draft');
});
