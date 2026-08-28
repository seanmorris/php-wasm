import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

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
		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/cakephp-5'
		}));
		getPhpBus.mockClear();
		window.history.pushState({}, '', '/select-framework.html');
	});

	it('detects the WordPress install and targets its vhost and entrypoint', async () => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/wordpress-7.1'
		}));

		render(<SelectFramework />);

		const wordpressIcon = screen.getByRole('img', {name: 'wordpress 7.1'});
		const wordpressCard = wordpressIcon.closest('.column');

		await waitFor(() => {
			expect(bus.analyzePath).toHaveBeenCalledWith('/persist/wordpress-7.1');
		});

		const card = within(wordpressCard);
		const openForm = card.getByRole('button', {name: 'Open Demo'}).closest('form');
		const ideForm = card.getByRole('button', {name: 'IDE'}).closest('form');

		expect(new URL(openForm.action).pathname).toBe('/cgi-bin/wordpress');
		expect(ideForm.querySelector('input[name="path"]')).toHaveValue(
			'/persist/wordpress-7.1/index.php'
		);
		expect(card.getByRole('button', {name: 'Reset'})).toBeInTheDocument();
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

	it('does not start the CGI bus when service workers are disabled', async () => {
		window.history.pushState({}, '', '/select-framework.html?iframed=1&no-service-worker=1');

		render(<SelectFramework />);

		expect(screen.getByRole('link', {name: 'Open Full Demo'})).toBeInTheDocument();

		await waitFor(() => {
			expect(getPhpBus).not.toHaveBeenCalled();
		});

		expect(bus.analyzePath).not.toHaveBeenCalled();
	});
});
