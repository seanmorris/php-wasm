import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
		, runSql: vi.fn(async () => ({rows: [{ready: true}]}))
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
		bus.runSql.mockReset();
		bus.runSql.mockResolvedValue({rows: [{ready: true}]});
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
		expect(form).toHaveAttribute('rel', 'opener');
		expect(form).toHaveAttribute('target', '_blank');
		expect(form.action).toMatch(/\/code-editor\.html$/);
		expect(pathInput).not.toBeNull();
		expect(pathInput).toHaveValue('/persist/cakephp-5/webroot/index.php');
	});

	it('opens a Drupal database modal and submits the selected backend', async () => {
		render(<SelectFramework />);

		const drupalCard = screen.getByRole('img', {name: 'drupal 11'}).closest('.column');
		const card = within(drupalCard);

		expect(screen.getAllByRole('img', {name: 'drupal 11'})).toHaveLength(1);
		expect(card.queryByRole('combobox')).not.toBeInTheDocument();
		fireEvent.click(card.getByRole('button', {name: 'Start'}));

		const dialog = screen.getByRole('dialog', {name: 'Choose a Drupal database'});
		const options = within(dialog);
		const sqlite = options.getByRole('radio', {name: 'SQLite'});
		const postgres = options.getByRole('radio', {name: /PostgreSQL/});
		const form = dialog.querySelector('form');
		const warning = options.getByText('Slow');

		expect(sqlite).toBeChecked();
		expect(postgres).not.toBeChecked();
		expect(warning.querySelector('img')).toHaveAttribute(
			'src'
			, expect.stringContaining('alert-16.png')
		);
		expect(form).toHaveAttribute('method', 'get');
		expect(form).toHaveAttribute('rel', 'opener');
		expect(form).toHaveAttribute('target', '_blank');
		expect(new URL(form.action).pathname).toBe('/install-demo.html');
		expect(form).toHaveFormValues({framework: 'drupal-11', database: 'sqlite'});

		fireEvent.click(postgres);
		expect(form).toHaveFormValues({framework: 'drupal-11', database: 'pgsql'});

		fireEvent.click(options.getByRole('button', {name: 'Cancel'}));
		expect(screen.queryByRole('dialog', {name: 'Choose a Drupal database'}))
			.not.toBeInTheDocument();
	});

	it('selects an installed PostgreSQL backend when SQLite is absent', async () => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		}));

		render(<SelectFramework />);

		const drupalCard = screen.getByRole('img', {name: 'drupal 11'}).closest('.column');
		const card = within(drupalCard);
		const openButton = await card.findByRole('button', {name: 'Open Demo'});
		const resetForm = card.getByRole('button', {name: 'Reset'}).closest('form');
		const ideForm = card.getByRole('button', {name: 'IDE'}).closest('form');
		const drupalIcon = card.getByRole('img', {name: 'drupal 11'});

		expect(new URL(drupalIcon.closest('a').href).searchParams.get('database')).toBe('pgsql');
		expect(openButton.closest('form')).toHaveFormValues({
			framework: 'drupal-11'
			, database: 'pgsql'
		});
		expect(resetForm).toHaveFormValues({
			framework: 'drupal-11'
			, database: 'pgsql'
			, overwrite: 'true'
		});
		expect(ideForm).toHaveFormValues({
			path: '/persist/drupal-11.4.5-pgsql/web/index.php'
		});
		expect(card.queryByRole('combobox')).not.toBeInTheDocument();
	});

	it('does not mark a restored PostgreSQL filesystem as installed without its database', async () => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		}));
		bus.runSql.mockResolvedValue({rows: [{ready: false}]});

		render(<SelectFramework />);

		await waitFor(() => expect(bus.runSql).toHaveBeenCalledTimes(1));

		const drupalCard = screen.getByRole('img', {name: 'drupal 11'}).closest('.column');
		const card = within(drupalCard);

		expect(card.getByRole('button', {name: 'Start'})).toBeInTheDocument();
		expect(card.queryByRole('button', {name: 'Open Demo'})).not.toBeInTheDocument();
	});

	it('refreshes the Drupal controls when the installer popup reports completion', async () => {
		render(<SelectFramework />);

		const drupalCard = screen.getByRole('img', {name: 'drupal 11'}).closest('.column');
		const card = within(drupalCard);

		fireEvent.click(card.getByRole('button', {name: 'Start'}));

		const dialog = screen.getByRole('dialog', {name: 'Choose a Drupal database'});
		const dialogControls = within(dialog);

		fireEvent.click(dialogControls.getByRole('radio', {name: /PostgreSQL/}));
		fireEvent.submit(dialog.querySelector('form'));
		await waitFor(() => {
			expect(screen.queryByRole('dialog', {name: 'Choose a Drupal database'}))
				.not.toBeInTheDocument();
		});

		await waitFor(() => expect(bus.analyzePath).toHaveBeenCalledTimes(7));

		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		}));
		fireEvent(window, new CustomEvent('install-complete', {detail: 'drupal-11'}));

		await card.findByRole('button', {name: 'Open Demo'});
		expect(card.getByRole('button', {name: 'IDE'})).toBeInTheDocument();
		expect(card.getByRole('button', {name: 'Reset'})).toBeInTheDocument();
		expect(card.queryByRole('button', {name: 'Start'})).not.toBeInTheDocument();
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
