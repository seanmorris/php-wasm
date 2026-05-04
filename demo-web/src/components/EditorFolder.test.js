import { render, waitFor } from '@testing-library/react';

const { bus, getPhpBus } = vi.hoisted(() => {
	Object.defineProperty(globalThis.navigator, 'serviceWorker', {
		configurable: true
		, value: {controller: {}}
	});

	const bus = {
		readdir: vi.fn(async () => ['child.txt'])
		, analyzePath: vi.fn(async () => ({object: {isFolder: false}}))
	};

	const getPhpBus = vi.fn(async () => bus);

	return {bus, getPhpBus};
});

vi.mock('../lib/phpBus', () => ({
	getPhpBus
}));

vi.mock('./EditorFile', () => ({
	default: function EditorFileMock() {
		return null;
	}
}));

import EditorFolder from './EditorFolder';

describe('EditorFolder', () => {
	beforeEach(() => {
		bus.readdir.mockClear();
		bus.analyzePath.mockClear();
		getPhpBus.mockClear();
	});

	it('does not reload directory contents when only startPath changes', async () => {
		const pathStates = {current: new Map()};
		const onOpenFile = vi.fn();
		const readdirCalls = () => bus.readdir.mock.calls.length;

		const { rerender } = render(
			<EditorFolder
				name = "/"
				onOpenFile = {onOpenFile}
				path = "/"
				pathStates = {pathStates}
				startPath = "/persist/first.php"
			/>
		);

		await waitFor(() => expect(readdirCalls()).toBe(1));

		rerender(
			<EditorFolder
				name = "/"
				onOpenFile = {onOpenFile}
				path = "/"
				pathStates = {pathStates}
				startPath = "/persist/second.php"
			/>
		);

		expect(readdirCalls()).toBe(1);
	});
});
