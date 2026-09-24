import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

const {filesystem, editor, createEditSession} = vi.hoisted(() => {
	const filesystem = {stat: vi.fn(), inspect: vi.fn(), read: vi.fn(), write: vi.fn(), list: vi.fn(), mutate: vi.fn()};
	const createEditSession = vi.fn((code, mode) => {
		const listeners = new Set();
		return {
			$modeId: mode, value: code
			, getValue() {
				return this.value;
			}
			, setValue(value) {
				this.value = value;
				for(const listener of listeners) listener();
			}
			, on(_event, listener) {
				listeners.add(listener);
			}
			, off(_event, listener) {
				listeners.delete(listener);
			}
			, destroy() {}
			, setNewLineMode() {}
			, setMode() {}
			, addMarker: vi.fn()
			, removeMarker: vi.fn()
			, setBreakpoint: vi.fn()
			, clearBreakpoint: vi.fn()
		};
	});
	const editor = {
		getSession() {
			return this.session;
		}
		, setSession(session) {
			this.session = session;
		}
		, setReadOnly: vi.fn(), on: vi.fn(), off: vi.fn(), scrollToLine: vi.fn()
		, session: null
	};
	return {filesystem, editor, createEditSession};
});

vi.mock('../lib/editorFilesystem', () => ({editorFilesystem: filesystem}));
vi.mock('ace-builds', () => ({default: {createEditSession}, Range: class Range {}}));
vi.mock('react-ace', () => ({
	default: function AceMock({onLoad}) {
		React.useEffect(() => {
			onLoad(editor);
		}, [onLoad]);
		return <div data-testid="ace-editor" />;
	}
}));
vi.mock('../components/Debugger', () => ({default: React.forwardRef(function DebuggerMock(_, ref) {
	React.useImperativeHandle(ref, () => ({}));
	return <div>Debugger running</div>;
})}));
vi.mock('../components/Header', () => ({default: () => <a href="/php-wasm/">Home</a>}));
vi.mock('../lib/runtimePaths', () => ({basePath: (path = '') => '/php-wasm/' + path}));
vi.mock('ace-builds/src-noconflict/mode-css', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-html', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-javascript', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-json', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-markdown', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-php', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-text', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-xml', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-yaml', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-monokai', () => ({}));

import Editor from './Editor';
beforeEach(() => {
	for(const mock of Object.values(filesystem)) mock.mockReset();
	createEditSession.mockClear();
	editor.setReadOnly.mockClear();
	window.history.replaceState({}, '', '/code-editor.html?path=/persist/a.php');
	filesystem.stat.mockImplementation(async path => ({path, exists: true, kind: 'file', size: 20}));
	filesystem.inspect.mockImplementation(async path => ({path, exists: true, kind: 'file', revision: 'original'}));
	filesystem.read.mockImplementation(async path => ({path, bytes: new TextEncoder().encode('contents of ' + path), revision: 'original'}));
	filesystem.write.mockResolvedValue({revision: 'saved'});
	filesystem.list.mockResolvedValue([]);
	filesystem.mutate.mockResolvedValue({});
});

const open = async () => {
	render(<Editor />);
	await screen.findByRole('tab', {name: 'a.php', exact: true});
	await waitFor(() => expect(editor.session?.getValue()).toBe('contents of /persist/a.php'));
};
const edit = value => act(() => editor.session.setValue(value));
const menu = () => fireEvent.click(screen.getByText('File', {selector: 'summary'}));

/** Verify the empty workspace exposes an editable, saveable document. */
const blankDocument = async () => {
	await screen.findByRole('tab', {name: /^Untitled \d+$/});
	await waitFor(() => expect(editor.session?.getValue()).toBe(''));
	expect(editor.setReadOnly).toHaveBeenLastCalledWith(false);
	expect(screen.getByRole('button', {name: 'Save file'})).toBeEnabled();
	expect(screen.queryByText('No file open')).not.toBeInTheDocument();
};

it.each([
	['empty', '']
	, ['edited', '<?php echo "new document";']
])('saves the %s initial untitled document through Save As', async (_name, text) => {
	window.history.replaceState({}, '', '/code-editor.html');
	filesystem.inspect.mockResolvedValue({exists: false, revision: null});
	render(<React.StrictMode><Editor /></React.StrictMode>);
	await blankDocument();
	expect(screen.getAllByRole('tab')).toHaveLength(1);
	expect(filesystem.read).not.toHaveBeenCalled();
	expect(filesystem.write).not.toHaveBeenCalled();
	const beforeUnload = new Event('beforeunload', {cancelable: true});
	window.dispatchEvent(beforeUnload);
	expect(beforeUnload.defaultPrevented).toBe(false);
	if(text) edit(text);
	fireEvent.click(screen.getByRole('button', {name: 'Save file'}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Save As'})).getByRole('button', {name: 'Cancel'}));
	await waitFor(() => expect(screen.getByRole('button', {name: 'Save file'})).toBeEnabled());
	expect(editor.session.getValue()).toBe(text);
	expect(filesystem.write).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole('button', {name: 'Save file'}));
	const prompt = await screen.findByRole('dialog', {name: 'Save As'});
	fireEvent.change(within(prompt).getByRole('textbox'), {target: {value: '/persist/new.php'}});
	fireEvent.click(within(prompt).getByRole('button', {name: 'Continue'}));
	await screen.findByRole('tab', {name: 'new.php', exact: true});
	expect(filesystem.write).toHaveBeenCalledWith('/persist/new.php', new TextEncoder().encode(text), null);
	expect(screen.getAllByRole('tab')).toHaveLength(1);
	expect(window.location.search).toContain('path=%2Fpersist%2Fnew.php');
});

it('opens the initial path after Ace loads and exposes labeled save controls', async () => {
	await open();
	expect(filesystem.read).toHaveBeenCalledWith('/persist/a.php');
	expect(screen.getAllByRole('tab')).toHaveLength(1);
	expect(editor.setReadOnly).toHaveBeenCalledWith(false);
	expect(window.location.search).toContain('path=%2Fpersist%2Fa.php');
	expect(screen.getByRole('button', {name: 'Save file'})).toBeEnabled();
});

it('waits for the initial file before deciding whether a blank document is needed', async () => {
	let finishStat;
	filesystem.stat.mockReturnValueOnce(new Promise(resolve => {
		finishStat = resolve;
	}));
	render(<React.StrictMode><Editor /></React.StrictMode>);
	await waitFor(() => expect(filesystem.stat).toHaveBeenCalledWith('/persist/a.php'));
	expect(screen.queryByRole('tab', {name: /^Untitled/})).not.toBeInTheDocument();
	await act(async () => finishStat({exists: true, kind: 'file', size: 20}));
	await screen.findByRole('tab', {name: 'a.php', exact: true});
	expect(screen.getAllByRole('tab')).toHaveLength(1);
});

it('asks before closing a dirty file and cancel preserves its buffer', async () => {
	await open();
	edit('unsaved');
	fireEvent.click(screen.getByRole('button', {name: 'Close a.php'}));
	const prompt = await screen.findByRole('dialog', {name: 'Unsaved changes'});
	fireEvent.click(within(prompt).getByRole('button', {name: 'Cancel'}));
	expect(screen.getByRole('tab', {name: 'a.php *', exact: true})).toBeInTheDocument();
	expect(editor.session.getValue()).toBe('unsaved');
	await waitFor(() => expect(screen.getByRole('button', {name: 'Close a.php'})).toBeEnabled());
	fireEvent.click(screen.getByRole('button', {name: 'Close a.php'}));
	fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', {name: 'Discard'}));
	await blankDocument();
	expect(screen.getAllByRole('tab')).toHaveLength(1);
});

it('keeps one blank document after closing all files', async () => {
	await open();
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'New untitled file'}));
	edit('discarded draft');
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'Close all', exact: true}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Unsaved changes'})).getByRole('button', {name: 'Discard'}));
	await blankDocument();
	expect(screen.getAllByRole('tab')).toHaveLength(1);
	expect(filesystem.write).not.toHaveBeenCalled();
});

it('preserves dirty state and reports write failure', async () => {
	await open();
	edit('unsaved');
	filesystem.write.mockRejectedValueOnce(new Error('quota exceeded'));
	fireEvent.click(screen.getByRole('button', {name: 'Save file'}));
	expect(await screen.findByRole('alert')).toHaveTextContent('quota exceeded');
	expect(screen.getByRole('tab')).toHaveTextContent('a.php *');
	expect(editor.session.getValue()).toBe('unsaved');
});

it('supports Save As without silently replacing an existing file', async () => {
	await open();
	edit('new contents');
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'Save As…'}));
	const prompt = await screen.findByRole('dialog', {name: 'Save As'});
	fireEvent.change(within(prompt).getByRole('textbox'), {target: {value: '/persist/existing.php'}});
	fireEvent.click(within(prompt).getByRole('button', {name: 'Continue'}));
	const replace = await screen.findByRole('dialog', {name: 'Replace existing file?'});
	expect(filesystem.write).not.toHaveBeenCalled();
	fireEvent.click(within(replace).getByRole('button', {name: 'Cancel'}));
	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	expect(filesystem.write).not.toHaveBeenCalled();
	expect(screen.getByRole('tab')).toHaveAttribute('title', '/persist/a.php');
});

it('requires saving changed files before starting the debugger', async () => {
	await open();
	edit('<?php echo 2;');
	fireEvent.click(screen.getByRole('button', {name: 'Start debugger'}));
	const prompt = await screen.findByRole('dialog', {name: 'Save before debugging?'});
	expect(screen.queryByText('Debugger running')).not.toBeInTheDocument();
	fireEvent.click(within(prompt).getByRole('button', {name: 'Save and start'}));
	await screen.findByText('Debugger running');
	expect(filesystem.write).toHaveBeenCalledWith('/persist/a.php', new TextEncoder().encode('<?php echo 2;'), 'original');
});

it('asks to save even an untouched untitled document before debugging', async () => {
	window.history.replaceState({}, '', '/code-editor.html');
	filesystem.inspect.mockResolvedValue({exists: false, revision: null});
	render(<Editor />);
	await blankDocument();
	fireEvent.click(screen.getByRole('button', {name: 'Start debugger'}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Save before debugging?'})).getByRole('button', {name: 'Save and start'}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Save As'})).getByRole('button', {name: 'Continue'}));
	await screen.findByText('Debugger running');
	expect(filesystem.write).toHaveBeenCalledWith('/persist/untitled.php', new TextEncoder().encode(''), null);
});

it('protects unload and internal navigation while a document is dirty', async () => {
	await open();
	edit('draft');
	const event = new Event('beforeunload', {cancelable: true});
	window.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	fireEvent.click(screen.getByRole('link', {name: 'Home'}));
	await screen.findByRole('dialog', {name: 'Unsaved changes'});
});

it('does not expose binary contents as editable text', async () => {
	filesystem.read.mockResolvedValue({bytes: new Uint8Array([255, 0, 128]), revision: 'binary'});
	render(<Editor />);
	await screen.findByText(/Binary or unsupported text encoding/);
	expect(screen.getByRole('button', {name: 'Save file'})).toBeDisabled();
});

it('does not bypass conflict detection when Save As keeps the current path', async () => {
	await open();
	edit('draft');
	filesystem.inspect.mockResolvedValue({exists: true, revision: 'external'});
	filesystem.write.mockRejectedValueOnce({message: 'conflict', code: 'EDITOR_CONFLICT'});
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'Save As…'}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Save As'})).getByRole('button', {name: 'Continue'}));
	const prompt = await screen.findByRole('dialog', {name: 'File changed on disk'});
	expect(filesystem.write).toHaveBeenCalledWith('/persist/a.php', new TextEncoder().encode('draft'), 'original');
	fireEvent.click(within(prompt).getByRole('button', {name: 'Cancel'}));
	expect(editor.session.getValue()).toBe('draft');
});

it('cancels a slow open preflight when a cached tab is selected', async () => {
	await open();
	let finishStat;
	filesystem.stat.mockReturnValueOnce(new Promise(resolve => {
		finishStat = resolve;
	}));
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'Open by path…'}));
	const prompt = await screen.findByRole('dialog');
	fireEvent.change(within(prompt).getByRole('textbox'), {target: {value: '/persist/slow.php'}});
	fireEvent.click(within(prompt).getByRole('button', {name: 'Continue'}));
	await waitFor(() => expect(filesystem.stat).toHaveBeenCalledWith('/persist/slow.php'));
	fireEvent.click(screen.getByRole('tab', {name: 'a.php', exact: true}));
	await act(async () => finishStat({kind: 'file', size: 4}));
	expect(filesystem.read).not.toHaveBeenCalledWith('/persist/slow.php');
	expect(editor.session.getValue()).toBe('contents of /persist/a.php');
	expect(screen.getByRole('tab', {selected: true})).toHaveAttribute('title', '/persist/a.php');
});

it('remaps a dirty tab on rename and closes it on confirmed deletion', async () => {
	filesystem.list.mockResolvedValue([{path: '/persist/a.php', name: 'a.php', kind: 'file'}]);
	filesystem.inspect.mockResolvedValue({path: '/persist/a.php', name: 'a.php', exists: true, kind: 'file', revision: 'original'});
	await open();
	edit('keep this draft');
	fireEvent.click(screen.getByRole('button', {name: 'Actions for a.php'}));
	fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', {name: 'Rename', exact: true}));
	const rename = await screen.findByRole('dialog', {name: 'Rename'});
	fireEvent.change(within(rename).getByRole('textbox'), {target: {value: 'renamed.php'}});
	fireEvent.click(within(rename).getByRole('button', {name: 'Rename'}));
	await screen.findByRole('tab', {name: 'renamed.php *'});
	expect(editor.session.getValue()).toBe('keep this draft');
	await waitFor(() => expect(screen.getByRole('button', {name: 'Save file'})).toBeEnabled());
	fireEvent.click(screen.getByRole('button', {name: 'Save file'}));
	await waitFor(() => expect(filesystem.write).toHaveBeenCalledWith('/persist/renamed.php', new TextEncoder().encode('keep this draft'), 'original'));
	fireEvent.click(screen.getByLabelText('More file actions'));
	await waitFor(() => expect(screen.getByRole('button', {name: 'Delete…'})).toBeEnabled());
	filesystem.inspect.mockResolvedValue({path: '/persist/renamed.php', revision: 'saved'});
	fireEvent.click(screen.getByRole('button', {name: 'Delete…'}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Delete permanently?'})).getByRole('button', {name: 'Delete'}));
	await blankDocument();
	expect(screen.getAllByRole('tab')).toHaveLength(1);
	expect(filesystem.mutate).toHaveBeenLastCalledWith({op: 'delete', path: '/persist/renamed.php', expectedRevision: 'saved'});
});

it('keeps all tabs open if an earlier file is edited while Close All saves a later one', async () => {
	await open();
	edit('first draft');
	const firstSession = editor.session;
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'Open by path…'}));
	const openPrompt = await screen.findByRole('dialog');
	fireEvent.change(within(openPrompt).getByRole('textbox'), {target: {value: '/persist/b.php'}});
	fireEvent.click(within(openPrompt).getByRole('button', {name: 'Continue'}));
	await waitFor(() => expect(editor.session?.getValue()).toBe('contents of /persist/b.php'));
	edit('second draft');
	let finishSecond;
	filesystem.write.mockResolvedValueOnce({revision: 'first-saved'}).mockImplementationOnce(() => new Promise(resolve => {
		finishSecond = resolve;
	}));
	await waitFor(() => expect(screen.getByRole('button', {name: 'Save file'})).toBeEnabled());
	menu();
	fireEvent.click(screen.getByRole('button', {name: 'Close all', exact: true}));
	fireEvent.click(within(await screen.findByRole('dialog', {name: 'Unsaved changes'})).getByRole('button', {name: 'Save', exact: true}));
	await waitFor(() => expect(filesystem.write).toHaveBeenCalledTimes(2));
	await act(async () => {
		firstSession.setValue('new first draft');
		finishSecond({revision: 'second-saved'});
	});
	expect(await screen.findByRole('alert')).toHaveTextContent('New edits were made while saving');
	expect(screen.getAllByRole('tab')).toHaveLength(2);
	expect(screen.getByRole('tab', {name: 'a.php *'})).toBeInTheDocument();
});
