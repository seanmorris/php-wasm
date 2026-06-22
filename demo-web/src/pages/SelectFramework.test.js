import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const { bus, getPhpBus } = vi.hoisted(() => {
	Object.defineProperty(globalThis.navigator, 'serviceWorker', {
		configurable: true
		, value: {controller: {}}
	});

	const bus = {
		analyzePath: vi.fn(async path => {
			return {
				exists: path === '/persist/cakephp-5'
			};
		})
	};

	const getPhpBus = vi.fn(async () => bus);

	return {bus, getPhpBus};
});

vi.mock('../lib/phpBus', () => ({
	getPhpBus
}));

vi.mock('../components/Header', () => ({
	default: function HeaderMock() {
		return React.createElement('div', null, 'Header');
	}
}));

vi.mock('../components/Filesystem', () => ({
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

vi.mock('../components/DoWithFile', () => ({
	default: function DoWithFileMock() {
		return null;
	}
}));

vi.mock('../components/ErrorDialog', () => ({
	default: function ErrorDialogMock() {
		return null;
	}
}));

vi.mock('../components/Confirm', () => ({
	default: function ConfirmMock() {
		return null;
	}
}));

import SelectFramework from './SelectFramework';

describe('SelectFramework', () => {
	beforeEach(() => {
		bus.analyzePath.mockClear();
		getPhpBus.mockClear();
		window.history.pushState({}, '', '/select-framework.html');
	});

	it('renders IDE controls as popup forms that target the framework entrypoint', async () => {
		render(<SelectFramework />);

		const ideButton = await screen.findByRole('button', {name: 'IDE'});

		await waitFor(() => {
			expect(bus.analyzePath).toHaveBeenCalledWith('/persist/cakephp-5');
		});

		const form = ideButton.closest('form');
		const pathInput = form?.querySelector('input[name="path"]');

		expect(form).not.toBeNull();
		expect(form).toHaveAttribute('method', 'get');
		expect(form).toHaveAttribute('target', '_blank');
		expect(form.action).toMatch(/\/code-editor\.html$/);
		expect(pathInput).not.toBeNull();
		expect(pathInput).toHaveValue('/persist/cakephp-5/webroot/index.php');
	});
});
