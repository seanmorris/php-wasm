import { render, waitFor } from '@testing-library/react';

const { sendMessage, sendMessageFor } = vi.hoisted(() => {
	Object.defineProperty(globalThis.navigator, 'serviceWorker', {
		configurable: true
		, value: {controller: {}}
	});

	const sendMessage = vi.fn(async action => {
		switch(action)
		{
			case 'readdir':
				return ['child.txt'];

			case 'analyzePath':
				return {object: {isFolder: false}};

			default:
				throw new Error(`Unexpected command: ${action}`);
		}
	});

	const sendMessageFor = vi.fn(() => sendMessage);

	return {sendMessage, sendMessageFor};
});

vi.mock('php-cgi-wasm/msg-bus.mjs', () => ({
	sendMessageFor
}));

vi.mock('./EditorFile', () => ({
	default: function EditorFileMock() {
		return null;
	}
}));

import EditorFolder from './EditorFolder';

describe('EditorFolder', () => {
	beforeEach(() => {
		sendMessage.mockClear();
		sendMessageFor.mockClear();
	});

	it('does not reload directory contents when only startPath changes', async () => {
		const pathStates = {current: new Map()};
		const onOpenFile = vi.fn();
		const readdirCalls = () => sendMessage.mock.calls.filter(([action]) => action === 'readdir').length;

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
