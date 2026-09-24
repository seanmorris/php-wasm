import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import VSCodeEditor from './VSCodeEditor';

const bridge = vi.hoisted(() => ({
	ready: null
	, getReadyPhpBus: vi.fn()
	, configure: vi.fn()
	, openFile: vi.fn()
}));

vi.mock('../components/Header', () => ({default: () => null}));
vi.mock('../lib/phpRuntime', () => ({getReadyPhpBus: bridge.getReadyPhpBus}));
vi.mock('../lib/phpDbgRuntimeArgs', () => ({createPhpDbgRuntimeArgs: () => ({})}));
vi.mock('../lib/PhpDbgBusSession', () => ({PhpDbgBusSession: class { dispose() {} }}));
vi.mock('vscode-react', () => ({
	useVSCode: () => ({
		VSCode: () => null
		, ready: bridge.ready
		, configure: bridge.configure
		, openFile: bridge.openFile
	})
}));

/**
 * Lets a test finish runtime startup or iframe loading independently.
 */
const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return {promise, resolve, reject};
};

describe('VS Code startup', () => {
	let bus;
	let editorReady;

	beforeEach(() => {
		vi.resetAllMocks();
		window.history.replaceState({}, '', '/vscode.html?path=/persist/demo.inc');
		editorReady = deferred();
		bridge.ready = editorReady.promise;
		bus = {
			analyzePath: vi.fn().mockResolvedValue({exists: false})
			, mkdir: vi.fn().mockResolvedValue(undefined)
			, writeFile: vi.fn().mockResolvedValue(undefined)
			, readFile: vi.fn()
		};
		bridge.getReadyPhpBus.mockResolvedValue(bus);
		bridge.configure.mockResolvedValue(undefined);
		bridge.openFile.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.history.replaceState({}, '', '/');
	});

	it('prepares PHP before the editor is ready and runs debug setup once during effect replay', async () => {
		render(<StrictMode><VSCodeEditor /></StrictMode>);

		await waitFor(() => expect(bus.writeFile).toHaveBeenCalledTimes(1));
		expect(bus.analyzePath.mock.calls).toEqual([['/.vscode'], ['/.vscode/launch.json']]);
		expect(bus.mkdir).toHaveBeenCalledExactlyOnceWith('/.vscode');
		expect(bridge.configure).not.toHaveBeenCalled();
		expect(bridge.openFile).not.toHaveBeenCalled();

		await act(async () => editorReady.resolve());

		expect(bridge.configure).toHaveBeenCalledTimes(1);
		expect(bridge.openFile).toHaveBeenCalledExactlyOnceWith('/persist/demo.inc', {languageId: 'php'});
		expect(bridge.configure.mock.invocationCallOrder[0])
			.toBeLessThan(bridge.openFile.mock.invocationCallOrder[0]);
	});

	it('waits for PHP if the editor loads first', async () => {
		const runtime = deferred();
		bridge.getReadyPhpBus.mockReturnValue(runtime.promise);
		render(<VSCodeEditor />);

		expect(bridge.getReadyPhpBus).toHaveBeenCalledTimes(1);
		await act(async () => editorReady.resolve());
		expect(bus.analyzePath).not.toHaveBeenCalled();
		expect(bridge.configure).not.toHaveBeenCalled();

		await act(async () => runtime.resolve(bus));

		expect(bus.writeFile).toHaveBeenCalledTimes(1);
		expect(bridge.configure).toHaveBeenCalledTimes(1);
		expect(bridge.openFile).toHaveBeenCalledTimes(1);
	});

	it('does not prepare files or configure an editor unmounted during PHP startup', async () => {
		const runtime = deferred();
		bridge.getReadyPhpBus.mockReturnValue(runtime.promise);
		const view = render(<VSCodeEditor />);
		view.unmount();

		await act(async () => {
			runtime.resolve(bus);
			editorReady.resolve();
		});

		expect(bus.analyzePath).not.toHaveBeenCalled();
		expect(bridge.configure).not.toHaveBeenCalled();
		expect(bridge.openFile).not.toHaveBeenCalled();
	});

	it('does not configure an editor unmounted while its iframe is loading', async () => {
		const view = render(<VSCodeEditor />);
		await waitFor(() => expect(bus.writeFile).toHaveBeenCalledTimes(1));
		view.unmount();

		await act(async () => editorReady.resolve());

		expect(bridge.configure).not.toHaveBeenCalled();
		expect(bridge.openFile).not.toHaveBeenCalled();
	});

	it('handles a PHP failure even while iframe readiness is pending', async () => {
		const error = new Error('PHP startup failed');
		bridge.getReadyPhpBus.mockRejectedValue(error);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		render(<VSCodeEditor />);

		await waitFor(() => expect(warn).toHaveBeenCalledExactlyOnceWith('Failed to prepare VS Code debug files.', error));
		expect(bridge.configure).not.toHaveBeenCalled();
		expect(bus.writeFile).not.toHaveBeenCalled();

		await act(async () => editorReady.resolve());
		expect(bridge.openFile).toHaveBeenCalledTimes(1);
	});

	it('handles rejected iframe readiness without sending bridge commands', async () => {
		const error = new Error('Editor disposed');
		const report = vi.spyOn(console, 'error').mockImplementation(() => {});
		render(<VSCodeEditor />);

		await act(async () => editorReady.reject(error));

		expect(report).toHaveBeenCalledExactlyOnceWith('Failed to start the VS Code bridge.', error);
		expect(bridge.configure).not.toHaveBeenCalled();
		expect(bridge.openFile).not.toHaveBeenCalled();
	});
});
