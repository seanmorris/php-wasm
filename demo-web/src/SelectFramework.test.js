import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const { sendMessage, sendMessageFor } = vi.hoisted(() => {
	Object.defineProperty(globalThis.navigator, 'serviceWorker', {
		configurable: true
		, value: {controller: {}}
	});

	const sendMessage = vi.fn(async (action, params = []) => {
		if(action !== 'analyzePath')
		{
			throw new Error(`Unexpected command: ${action}(${JSON.stringify(params)})`);
		}

		return {
			exists: params[0] === '/persist/cakephp-5'
		};
	});

	const sendMessageFor = vi.fn(() => sendMessage);

	return {sendMessage, sendMessageFor};
});

vi.mock('php-cgi-wasm/msg-bus.mjs', () => ({
	sendMessageFor
}));

vi.mock('./Header', () => ({
	default: function HeaderMock() {
		return React.createElement('div', null, 'Header');
	}
}));

vi.mock('./Filesystem', () => ({
	Backup: function BackupMock() {
		return null;
	}
	, Clear: function ClearMock() {
		return null;
	}
	, Restore: function RestoreMock() {
		return null;
	}
}));

vi.mock('./DoWithFile', () => ({
	default: function DoWithFileMock() {
		return null;
	}
}));

vi.mock('./ErrorDialog', () => ({
	default: function ErrorDialogMock() {
		return null;
	}
}));

vi.mock('./Confirm', () => ({
	default: function ConfirmMock() {
		return null;
	}
}));

import SelectFramework from './SelectFramework';

describe('SelectFramework', () => {
	beforeEach(() => {
		sendMessage.mockClear();
		sendMessageFor.mockClear();
		window.history.pushState({}, '', '/select-framework.html');
	});

	it('renders IDE controls as popup forms that preserve the project path', async () => {
		render(<SelectFramework />);

		const ideButton = await screen.findByRole('button', {name: 'IDE'});

		await waitFor(() => {
			expect(sendMessage).toHaveBeenCalledWith('analyzePath', ['/persist/cakephp-5']);
		});

		const form = ideButton.closest('form');
		const pathInput = form?.querySelector('input[name="path"]');

		expect(form).not.toBeNull();
		expect(form).toHaveAttribute('method', 'get');
		expect(form).toHaveAttribute('target', '_blank');
		expect(form.action).toMatch(/\/code-editor\.html$/);
		expect(pathInput).not.toBeNull();
		expect(pathInput).toHaveValue('/persist/cakephp-5/README.md');
	});
});
