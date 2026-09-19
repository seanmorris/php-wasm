import { render } from '@testing-library/react';
import VSCodeEditor from './VSCodeEditor';

const bridge = vi.hoisted(() => ({
	options: null
	, bus: {readdir: vi.fn()}
	, ready: new Promise(() => {})
}));

vi.mock('../components/Header', () => ({default: () => null}));
vi.mock('../lib/phpBus', () => ({getPhpBus: async () => bridge.bus}));
vi.mock('../lib/phpDbgRuntimeArgs', () => ({createPhpDbgRuntimeArgs: () => ({})}));
vi.mock('../lib/PhpDbgBusSession', () => ({PhpDbgBusSession: class { dispose() {} }}));
vi.mock('vscode-react', () => ({
	useVSCode: options => {
		bridge.options = options;
		return {VSCode: () => null, ready: bridge.ready};
	}
}));

describe('VS Code filesystem bridge', () => {
	beforeEach(() => bridge.bus.readdir.mockReset());

	it('forwards typed listing options and returns the serializable entries unchanged', async () => {
		const entries = [{name: 'folder', isFolder: true}, {name: 'café.php', isFolder: false}];
		bridge.bus.readdir.mockResolvedValue(entries);
		render(<VSCodeEditor />);
		const options = {withFileTypes: true};
		await expect(bridge.options.fsHandlers.readdir('/persist', options)).resolves.toBe(entries);
		expect(bridge.bus.readdir).toHaveBeenCalledWith('/persist', options);
	});

	it('keeps default calls compatible and propagates filesystem errors', async () => {
		bridge.bus.readdir.mockResolvedValueOnce(['.', '..', 'file.php']);
		render(<VSCodeEditor />);
		await expect(bridge.options.fsHandlers.readdir('/persist')).resolves.toEqual(['.', '..', 'file.php']);
		expect(bridge.bus.readdir).toHaveBeenLastCalledWith('/persist', undefined);
		bridge.bus.readdir.mockRejectedValueOnce(new Error('permission denied'));
		await expect(bridge.options.fsHandlers.readdir('/private', {withFileTypes: true})).rejects.toThrow('permission denied');
		expect(bridge.bus.readdir).toHaveBeenCalledTimes(2);
	});
});
