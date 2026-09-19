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
		, getSettings: vi.fn(async () => ({vHosts: []}))
	};

	const getPhpBus = vi.fn(async () => bus);

	return {bus, getPhpBus};
});

vi.mock('../lib/phpRuntime', () => ({
	getReadyPhpBus: getPhpBus
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
import { drupalPgsqlDatabase } from '../lib/drupalDatabase';

describe('SelectFramework', () => {
	beforeEach(() => {
		bus.analyzePath.mockClear();
		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/cakephp-5'
		}));
		bus.runSql.mockReset();
		bus.runSql.mockResolvedValue({rows: [{ready: true}]});
		bus.getSettings.mockReset();
		bus.getSettings.mockResolvedValue({vHosts: []});
		getPhpBus.mockReset().mockResolvedValue(bus);
		window.history.pushState({}, '', '/select-framework.html');
	});

	it('shows a startup error and retries installation discovery on request', async () => {
		getPhpBus.mockRejectedValueOnce(new Error('PHP could not start after updating.'));
		render(<SelectFramework />);

		await screen.findByRole('alert');
		expect(bus.analyzePath).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', {name: 'Retry PHP startup'}));
		await waitFor(() => expect(bus.analyzePath).toHaveBeenCalled());
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

	it.each([
		['drupal 11', '/persist/drupal-11.4.5/web', '/persist/drupal-11.4.5/web/sites/default/files/.sqlite']
		, ['laravel 11', '/persist/laravel-11', '/persist/laravel-11/database/database.sqlite']
		, ['wordpress 7.1', '/persist/wordpress-7.1', '/persist/wordpress-7.1/wp-content/database/.ht.sqlite']
	])('opens the installed %s SQLite database with the same popup behavior as IDE', async (name, installPath, target) => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: [installPath, target].includes(path)
		}));

		render(<SelectFramework />);

		const card = within(screen.getByRole('img', {name}).closest('.column'));
		const dbForm = (await card.findByRole('button', {name: 'DB'})).closest('form');
		const ideForm = card.getByRole('button', {name: 'IDE'}).closest('form');

		expect(new URL(dbForm.action).pathname).toBe('/query-workbench.html');
		expect(dbForm).toHaveFormValues({engine: 'sqlite', target, connect: '1'});
		expect(dbForm.querySelector('input[name="sql"]')).toBeNull();
		for(const attribute of ['method', 'rel', 'target'])
		{
			expect(dbForm).toHaveAttribute(attribute, ideForm.getAttribute(attribute));
		}
		expect(ideForm.nextElementSibling).toBe(dbForm);
	});

	it('does not offer DB controls for unsupported demos or missing SQLite files', async () => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: [
				'/persist/cakephp-5', '/persist/codeigniter-4', '/persist/laminas-3'
				, '/persist/laravel-11', '/persist/wordpress-7.1'
				, '/persist/drupal-11.4.5/web'
			].includes(path)
		}));

		render(<SelectFramework />);

		await waitFor(() => expect(screen.getAllByRole('button', {name: 'IDE'})).toHaveLength(6));
		expect(screen.queryByRole('button', {name: 'DB'})).not.toBeInTheDocument();
	});

	it('does not offer a DB control for an uninstalled framework or a directory at the database path', async () => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: [
				'/persist/laravel-11', '/persist/laravel-11/database/database.sqlite'
				, '/persist/wordpress-7.1/wp-content/database/.ht.sqlite'
			].includes(path)
			, object: {isFolder: path === '/persist/laravel-11/database/database.sqlite'}
		}));

		render(<SelectFramework />);

		await screen.findByRole('button', {name: 'IDE'});
		expect(screen.queryByRole('button', {name: 'DB'})).not.toBeInTheDocument();
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
		const dbForm = card.getByRole('button', {name: 'DB'}).closest('form');
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
		expect(new URL(dbForm.action).pathname).toBe('/query-workbench.html');
		expect(dbForm).toHaveFormValues({engine: 'pgsql', target: drupalPgsqlDatabase, connect: '1'});
		expect(card.queryByRole('combobox')).not.toBeInTheDocument();
	});

	it.each(['pgsql', 'sqlite'])('uses the active Drupal %s vhost when both backend installations exist', async engine => {
		bus.analyzePath.mockImplementation(async path => ({
			exists: [
				'/persist/drupal-11.4.5/web'
				, '/persist/drupal-11.4.5/web/sites/default/files/.sqlite'
				, '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
			].includes(path)
		}));
		const directory = engine === 'pgsql' ? '/persist/drupal-11.4.5-pgsql/web' : '/persist/drupal-11.4.5/web';
		bus.getSettings.mockResolvedValue({vHosts: [{pathPrefix: '/cgi-bin/drupal', directory}]});

		render(<SelectFramework />);

		const card = within(screen.getByRole('img', {name: 'drupal 11'}).closest('.column'));
		const dbForm = (await card.findByRole('button', {name: 'DB'})).closest('form');
		expect(bus.getSettings).toHaveBeenCalledOnce();
		expect(dbForm).toHaveFormValues({
			engine
			, target: engine === 'pgsql' ? drupalPgsqlDatabase : '/persist/drupal-11.4.5/web/sites/default/files/.sqlite'
			, connect: '1'
		});
		expect(card.getByRole('button', {name: 'IDE'}).closest('form')).toHaveFormValues({path: `${directory}/index.php`});
		expect(card.getByRole('button', {name: 'Open Demo'}).closest('form')).toHaveFormValues({database: engine});
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
		expect(card.queryByRole('button', {name: 'DB'})).not.toBeInTheDocument();
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

		await waitFor(() => expect(bus.analyzePath).toHaveBeenCalledTimes(10));

		bus.analyzePath.mockImplementation(async path => ({
			exists: path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		}));
		fireEvent(window, new CustomEvent('install-complete', {detail: 'drupal-11'}));

		await card.findByRole('button', {name: 'Open Demo'});
		expect(card.getByRole('button', {name: 'IDE'})).toBeInTheDocument();
		expect(card.getByRole('button', {name: 'Reset'})).toBeInTheDocument();
		expect(card.getByRole('button', {name: 'DB'}).closest('form')).toHaveFormValues({
			engine: 'pgsql', target: drupalPgsqlDatabase, connect: '1'
		});
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
