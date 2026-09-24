import {fireEvent, render, screen, waitFor} from '@testing-library/react';
const {filesystem} = vi.hoisted(() => ({filesystem: {list: vi.fn()}}));
vi.mock('../lib/editorFilesystem', () => ({editorFilesystem: filesystem}));
import EditorFolder from './EditorFolder';

const props = () => ({
	entry: {path: '/persist', name: 'persist', kind: 'directory'}
	, expanded: new Set()
	, selected: new Set()
	, onExpand: vi.fn()
	, onSelect: vi.fn()
	, onOpenFile: vi.fn(), onMenu: vi.fn(), onDrop: vi.fn(), refresh: 0
});
beforeEach(() => {
	filesystem.list.mockReset().mockResolvedValue([{path: '/persist/a.txt', name: 'a.txt', kind: 'file'}]);
});
it('loads only expanded folders and refreshes on explicit invalidation', async () => {
	const input = props();
	const {rerender} = render(<ul role="tree"><EditorFolder {...input} /></ul>);
	expect(filesystem.list).not.toHaveBeenCalled();
	rerender(<ul role="tree"><EditorFolder {...input} expanded={new Set(['/persist'])} /></ul>);
	await screen.findByRole('button', {name: 'a.txt', exact: true});
	expect(filesystem.list).toHaveBeenCalledTimes(1);
	rerender(<ul role="tree"><EditorFolder {...input} expanded={new Set(['/persist'])} refresh={1} /></ul>);
	await waitFor(() => expect(filesystem.list).toHaveBeenCalledTimes(2));
});
it('surfaces directory failures and allows retry', async () => {
	filesystem.list.mockRejectedValueOnce(new Error('worker unavailable'));
	render(<ul role="tree"><EditorFolder {...props()} expanded={new Set(['/persist'])} /></ul>);
	await screen.findByRole('alert');
	fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
	await screen.findByRole('button', {name: 'a.txt', exact: true});
	expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('provides explicit action buttons and keyboard expansion', () => {
	const input = props();
	render(<ul role="tree"><EditorFolder {...input} /></ul>);
	fireEvent.keyDown(screen.getByRole('treeitem'), {key: 'ArrowRight'});
	expect(input.onExpand).toHaveBeenCalledWith('/persist', true);
	fireEvent.click(screen.getByRole('button', {name: 'Actions for persist'}));
	expect(input.onMenu).toHaveBeenCalledWith(input.entry);
});
