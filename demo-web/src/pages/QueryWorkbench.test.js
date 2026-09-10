import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

const {bus, getPhpBus, editor} = vi.hoisted(() => {
	const bus = {queryWorkbenchTargets: vi.fn(), queryWorkbenchSchema: vi.fn(), queryWorkbenchExecute: vi.fn(), queryWorkbenchTable: vi.fn(), queryWorkbenchUpdateRow: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), analyzePath: vi.fn()};
	return {bus, getPhpBus: vi.fn(async () => bus), editor: {getSelectedText: vi.fn(() => ''), focus: vi.fn()}};
});

vi.mock('../lib/phpBus', () => ({getPhpBus}));
vi.mock('../components/Header', () => ({default: () => <div>Header</div>}));
vi.mock('ace-builds/src-noconflict/mode-sql', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-monokai', () => ({}));
vi.mock('react-ace', () => ({default: function AceMock({value, onChange, onLoad, readOnly}) {
	const input = React.useRef(null);
	React.useEffect(() => {
		editor.focus.mockImplementation(() => input.current?.focus());
		onLoad(editor);
	}, [onLoad]);
	return <textarea ref={input} aria-label="SQL query" value={value} onChange={event => onChange(event.target.value)} readOnly={readOnly} />;
}}));

import QueryWorkbench, {displayCell} from './QueryWorkbench';

const sqliteTarget = '/persist/workbench.sqlite';
const pgTarget = 'idb://host=drupal-11-pg18 dbname=postgres port=5432';
const idleResultsText = 'Results appear here. SQL runs only when you click Run.';
const installedTargets = [{engine: 'sqlite', target: sqliteTarget, label: 'Test SQLite'}, {engine: 'pgsql', target: pgTarget, label: 'Drupal PostgreSQL'}];
const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const tableResult = {
	results: [{columns: [{name: 'id', type: 'INTEGER'}, {name: 'label', type: 'TEXT'}, {name: 'blob', type: 'BLOB'}], rows: [[1, 'before', {type: 'binary', value: '00ff'}]], returnedRows: 1, affectedRows: null, truncated: false}]
	, edit: {schema: 'main', table: 'items', keyColumns: ['id'], editableColumns: ['label', 'blob']}
	, elapsedMs: 1
};

const connect = async () => {
	await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
	fireEvent.click(screen.getByRole('button', {name: 'Connect'}));
	await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
};

const preview = async () => {
	await connect();
	fireEvent.click(screen.getByTitle('main.items (table)'));
	fireEvent.click(screen.getByRole('button', {name: 'Select rows'}));
	await screen.findByRole('button', {name: 'Edit row 1 label'});
};

describe('QueryWorkbench', () => {
	beforeEach(() => {
		Object.defineProperty(navigator, 'serviceWorker', {configurable: true, value: new EventTarget()});
		vi.clearAllMocks();
		bus.queryWorkbenchTargets.mockResolvedValue(installedTargets);
		bus.queryWorkbenchSchema.mockResolvedValue([{schema: 'main', name: 'items', type: 'table', columns: [{name: 'id', type: 'INTEGER'}, {name: 'label', type: 'TEXT'}]}]);
		bus.queryWorkbenchExecute.mockImplementation(async request => ({...request, elapsedMs: 2, results: [{columns: [{name: 'value', type: 'TEXT'}, {name: 'value', type: 'TEXT'}], rows: [[null, ''], [0, false]], returnedRows: 2, affectedRows: null, truncated: true}]}));
		bus.queryWorkbenchTable.mockResolvedValue(tableResult);
		bus.queryWorkbenchUpdateRow.mockResolvedValue({affectedRows: 1});
		bus.readFile.mockResolvedValue(new TextEncoder().encode('SELECT 42;'));
		bus.writeFile.mockResolvedValue(undefined);
		bus.analyzePath.mockResolvedValue({exists: false});
		editor.getSelectedText.mockReturnValue('');
		window.history.replaceState({}, '', '/query-workbench.html');
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		if(serviceWorkerDescriptor)
		{
			Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
		}
		else
		{
			delete navigator.serviceWorker;
		}
	});

	it('enables horizontal scrolling by default and allows wrapped results', async () => {
		const {container} = render(<QueryWorkbench />);
		await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
		const toggle = screen.getByRole('checkbox', {name: 'Horizontal scroll'});
		expect(toggle).toBeChecked();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('data-horizontal-scroll', 'true');
		fireEvent.click(toggle);
		expect(toggle).not.toBeChecked();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('data-horizontal-scroll', 'false');
	});

	it('preselects URL database only, never SQL or autorun', async () => {
		window.history.replaceState({}, '', `/query-workbench.html?engine=pgsql&target=${encodeURIComponent(pgTarget)}&sql=DELETE+FROM+users&autorun=1`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalledOnce());
		expect(screen.getByRole('combobox', {name: 'Database engine'})).toHaveValue('pgsql');
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 1 AS example;');
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchSchema).not.toHaveBeenCalled();
		expect(window.location.search).not.toContain('DELETE');
	});

	it.each([['sqlite', sqliteTarget], ['pgsql', pgTarget]])('connects the exact %s framework URL target once in StrictMode without running URL SQL', async (engine, target) => {
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine, target, connect: '1', sql: 'DELETE FROM users', autorun: '1'})}`);
		render(<React.StrictMode><QueryWorkbench /></React.StrictMode>);
		await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledExactlyOnceWith({engine, target});
		expect(screen.getByRole('combobox', {name: 'Database engine'})).toHaveValue(engine);
		expect(screen.getByRole('combobox', {name: 'Installed database'})).toHaveValue(target);
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 1 AS example;');
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchTable).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchUpdateRow).not.toHaveBeenCalled();
		expect(new URLSearchParams(window.location.search).has('connect')).toBe(false);
		expect(new URLSearchParams(window.location.search).has('sql')).toBe(false);
		fireEvent.click(screen.getByRole('button', {name: 'Refresh databases'}));
		await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledOnce();
	});

	it.each([
		{connect: '1', engine: 'sqlite'}
		, {connect: '1', target: sqliteTarget}
		, {connect: '1', engine: 'mysql', target: sqliteTarget}
		, {connect: 'true', engine: 'sqlite', target: sqliteTarget}
	])('does not automatically connect a fallback for incomplete or unsupported URL params %j', async params => {
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({...params, sql: 'DELETE FROM users', autorun: '1'})}`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
		expect(bus.queryWorkbenchSchema).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled();
	});

	it.each([
		['sqlite', '/persist/missing.sqlite']
		, ['pgsql', 'idb://unknown-database']
	])('does not fall back or retry when the requested %s URL database cannot be opened', async (engine, target) => {
		bus.queryWorkbenchSchema.mockRejectedValueOnce(new Error('Requested database is not installed.'));
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine, target, connect: '1'})}`);
		render(<QueryWorkbench />);
		await screen.findByText(/Requested database is not installed/);
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledExactlyOnceWith({engine, target});
		expect(new URLSearchParams(window.location.search).get('target')).toBe(target);
		expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled();
		fireEvent.click(screen.getByRole('button', {name: 'Refresh databases'}));
		await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledOnce();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('does not reconnect the URL database after the service worker changes', async () => {
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine: 'sqlite', target: sqliteTarget, connect: '1'})}`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
		act(() => {navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));});
		await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledOnce();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled();
		expect(screen.getByRole('button', {name: 'Connect'})).toBeEnabled();
	});

	it('does not duplicate a manual connection made while URL discovery is pending', async () => {
		let resolve;
		bus.queryWorkbenchTargets.mockReturnValueOnce(new Promise(done => {resolve = done;}));
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine: 'sqlite', target: sqliteTarget, connect: '1'})}`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalledOnce());
		fireEvent.click(screen.getByRole('button', {name: 'Connect'}));
		await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
		await act(async () => {resolve(installedTargets);});
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledExactlyOnceWith({engine: 'sqlite', target: sqliteTarget});
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('connects once after the new popup acquires a service worker during discovery and ignores stale discovery', async () => {
		let resolve;
		bus.queryWorkbenchTargets.mockReturnValueOnce(new Promise(done => {resolve = done;}));
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine: 'sqlite', target: sqliteTarget, connect: '1'})}`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalledOnce());
		act(() => {navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));});
		await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
		await act(async () => {resolve(installedTargets);});
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledExactlyOnceWith({engine: 'sqlite', target: sqliteTarget});
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled();
	});

	it.each(['engine', 'path', 'path-round-trip', 'tab-round-trip'])('respects a manual %s choice while URL target discovery is pending', async choice => {
		let resolve;
		bus.queryWorkbenchTargets.mockReturnValueOnce(new Promise(done => {resolve = done;}));
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine: 'sqlite', target: sqliteTarget, connect: '1'})}`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalledOnce());
		if(choice === 'engine')
		{
			fireEvent.change(screen.getByRole('combobox', {name: 'Database engine'}), {target: {value: 'pgsql'}});
		}
		else if(choice === 'tab-round-trip')
		{
			fireEvent.click(screen.getByRole('button', {name: '+ Query tab'}));
			fireEvent.click(screen.getByRole('tab', {name: /Query 1/}));
		}
		else
		{
			fireEvent.change(screen.getByRole('textbox', {name: 'SQLite database path'}), {target: {value: '/persist/manual.sqlite'}});
			if(choice === 'path-round-trip')
			{
				fireEvent.change(screen.getByRole('textbox', {name: 'SQLite database path'}), {target: {value: sqliteTarget}});
			}
		}
		await act(async () => {resolve(installedTargets);});
		expect(bus.queryWorkbenchSchema).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled();
		if(choice === 'engine')
		{
			expect(screen.getByRole('combobox', {name: 'Database engine'})).toHaveValue('pgsql');
			expect(screen.getByRole('combobox', {name: 'Installed database'})).toHaveValue(pgTarget);
		}
		else
		{
			expect(screen.getByRole('textbox', {name: 'SQLite database path'})).toHaveValue(choice === 'path' ? '/persist/manual.sqlite' : sqliteTarget);
		}
	});

	it('runs the selection with bound target and preserves duplicate column names and NULL', async () => {
		render(<QueryWorkbench />);
		await connect();
		editor.getSelectedText.mockReturnValue('SELECT NULL, \'\';');
		fireEvent.keyDown(window, {key: 'Enter', ctrlKey: true});
		const table = await screen.findByRole('table', {name: 'Query result 1'});
		expect(bus.queryWorkbenchExecute).toHaveBeenCalledWith(expect.objectContaining({engine: 'sqlite', target: sqliteTarget, sql: 'SELECT NULL, \'\';', maxRows: 100}));
		expect(within(table).getAllByRole('columnheader', {name: 'value'})).toHaveLength(2);
		expect(within(table).getByText('NULL')).toHaveClass('null-cell');
		expect(within(table).getByText('false')).toBeInTheDocument();
		expect(screen.getByText(/Result truncated/)).toBeInTheDocument();
		expect(screen.queryByRole('button', {name: /Edit row/})).not.toBeInTheDocument();
	});

	it.each([['sqlite', 'main'], ['pgsql', 'public']])('shows only table names for %s while preserving schema-qualified previews', async (engine, schema) => {
		const target = engine === 'pgsql' ? pgTarget : sqliteTarget;
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine, target})}`);
		bus.queryWorkbenchSchema.mockResolvedValueOnce([{schema, name: 'items', type: 'table', columns: []}]);
		render(<QueryWorkbench />);
		await connect();
		const summary = screen.getByTitle(`${schema}.items (table)`);
		expect(summary.textContent).toBe('items');
		fireEvent.click(summary);
		fireEvent.click(screen.getByRole('button', {name: 'Select rows'}));
		await screen.findByRole('table');
		expect(bus.queryWorkbenchTable).toHaveBeenCalledWith({engine, target, schema, table: 'items', maxRows: 100});
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue(`SELECT * FROM "${schema}"."items" LIMIT 100;`);
	});

	it('keeps each query tab bound to its own database and SQL', async () => {
		render(<QueryWorkbench />);
		await connect();
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL query'}), {target: {value: 'SELECT 7;'}});
		fireEvent.click(screen.getByRole('button', {name: '+ Query tab'}));
		fireEvent.change(screen.getByRole('combobox', {name: 'Database engine'}), {target: {value: 'pgsql'}});
		await connect();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await screen.findByRole('table', {name: 'Query result 1'});
		expect(bus.queryWorkbenchExecute).toHaveBeenLastCalledWith(expect.objectContaining({engine: 'pgsql', target: pgTarget}));
		fireEvent.click(screen.getByRole('tab', {name: /Query 1/}));
		expect(screen.getByRole('combobox', {name: 'Database engine'})).toHaveValue('sqlite');
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 7;');
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
	});

	it('keeps unresolved requests busy and attaches late results to the originating tab', async () => {
		let resolve;
		bus.queryWorkbenchExecute.mockImplementation(request => new Promise(done => {resolve = () => done({...request, ...tableResult});}));
		const {container} = render(<QueryWorkbench />);
		await connect();
		vi.useFakeTimers();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await act(async () => {await Promise.resolve();});
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		expect(screen.queryByText(idleResultsText)).not.toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'true');
		await act(async () => {vi.advanceTimersByTime(10001);});
		expect(screen.getByRole('status')).toHaveTextContent('Still running');
		fireEvent.keyDown(window, {key: 'Enter', metaKey: true});
		expect(bus.queryWorkbenchExecute).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole('button', {name: '+ Query tab'}));
		expect(screen.getByText(idleResultsText)).toBeInTheDocument();
		expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'false');
		fireEvent.click(screen.getByRole('tab', {name: /Query 1/}));
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'true');
		fireEvent.click(screen.getByRole('tab', {name: /Query 2/}));
		await act(async () => {resolve();});
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('tab', {name: /Query 1/}));
		expect(screen.getByRole('table')).toBeInTheDocument();
		expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'false');
	});

	it('reports execution failure and allows retry after a real reply', async () => {
		let reject;
		bus.queryWorkbenchExecute.mockImplementationOnce(() => new Promise((_, fail) => {reject = fail;}));
		const {container} = render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await waitFor(() => expect(bus.queryWorkbenchExecute).toHaveBeenCalledOnce());
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'true');
		await act(async () => {reject(new Error('syntax error near SELECT'));});
		expect(await screen.findByText(/syntax error near SELECT/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', {name: 'Result Grid'}));
		expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
		expect(screen.getByText(idleResultsText)).toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'false');
		expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await screen.findByRole('table');
	});

	it('shows loading while a table preview is pending, then replaces it with the result grid', async () => {
		let resolve;
		bus.queryWorkbenchTable.mockReturnValueOnce(new Promise(done => {resolve = done;}));
		const {container} = render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByTitle('main.items (table)'));
		fireEvent.click(screen.getByRole('button', {name: 'Select rows'}));
		await waitFor(() => expect(bus.queryWorkbenchTable).toHaveBeenCalledOnce());
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		expect(screen.queryByText(idleResultsText)).not.toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'true');
		await act(async () => {resolve(tableResult);});
		expect(screen.getByRole('table', {name: 'Query result 1'})).toBeInTheDocument();
		expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'false');
	});

	it('keeps the result grid idle during a pending schema connection', async () => {
		let resolve;
		bus.queryWorkbenchSchema.mockReturnValueOnce(new Promise(done => {resolve = done;}));
		const {container} = render(<QueryWorkbench />);
		await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh databases'})).toBeEnabled());
		fireEvent.click(screen.getByRole('button', {name: 'Connect'}));
		await waitFor(() => expect(bus.queryWorkbenchSchema).toHaveBeenCalledOnce());
		expect(screen.getByText(idleResultsText)).toBeInTheDocument();
		expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
		expect(container.querySelector('.result-scroll')).toHaveAttribute('aria-busy', 'false');
		await act(async () => {resolve([]);});
	});

	it('opens and saves SQL through the current worker without executing it', async () => {
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalled());
		expect(screen.queryByRole('textbox', {name: 'SQL file path'})).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', {name: 'Load SQL'}));
		const loadDialog = screen.getByRole('dialog', {name: 'Load SQL'});
		fireEvent.change(within(loadDialog).getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/example.sql'}});
		fireEvent.click(within(loadDialog).getByRole('button', {name: 'Load'}));
		await waitFor(() => expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 42;'));
		expect(bus.readFile).toHaveBeenCalledExactlyOnceWith('/persist/example.sql');
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.queryByRole('textbox', {name: 'SQL file path'})).not.toBeInTheDocument();
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL query'}), {target: {value: 'SELECT 43;'}});
		fireEvent.keyDown(window, {key: 's', metaKey: true});
		await waitFor(() => expect(bus.writeFile).toHaveBeenCalledWith('/persist/example.sql', new TextEncoder().encode('SELECT 43;')));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', {name: 'Save SQL'}));
		const saveDialog = screen.getByRole('dialog', {name: 'Save SQL'});
		expect(within(saveDialog).getByRole('textbox', {name: 'SQL file path'})).toHaveValue('/persist/example.sql');
		fireEvent.change(within(saveDialog).getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/copy.sql'}});
		fireEvent.click(within(saveDialog).getByRole('button', {name: 'Save'}));
		await waitFor(() => expect(bus.writeFile).toHaveBeenLastCalledWith('/persist/copy.sql', new TextEncoder().encode('SELECT 43;')));
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('never writes SQL files outside /persist or over PHP source', async () => {
		render(<QueryWorkbench />);
		fireEvent.click(screen.getByRole('button', {name: 'Save SQL'}));
		const dialog = screen.getByRole('dialog', {name: 'Save SQL'});
		fireEvent.change(within(dialog).getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/../index.php'}});
		fireEvent.click(within(dialog).getByRole('button', {name: 'Save'}));
		await screen.findByText(/Choose a .sql file inside/);
		expect(bus.writeFile).not.toHaveBeenCalled();
	});

	it.each(['Save', 'Load'])('cancels the %s file dialog without changing SQL or performing filesystem operations', async mode => {
		render(<QueryWorkbench />);
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL query'}), {target: {value: 'SELECT 17;'}});
		fireEvent.click(screen.getByRole('button', {name: `${mode} SQL`}));
		const dialog = screen.getByRole('dialog', {name: `${mode} SQL`});
		fireEvent.change(within(dialog).getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/cancelled.sql'}});
		fireEvent.click(within(dialog).getByRole('button', {name: 'Cancel'}));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.queryByRole('textbox', {name: 'SQL file path'})).not.toBeInTheDocument();
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 17;');
		expect(bus.analyzePath).not.toHaveBeenCalled();
		expect(bus.writeFile).not.toHaveBeenCalled();
		expect(bus.readFile).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', {name: `${mode} SQL`}));
		expect(within(screen.getByRole('dialog', {name: `${mode} SQL`})).getByRole('textbox', {name: 'SQL file path'})).toHaveValue('/persist/query.sql');
	});

	it('opens Save for an unsaved shortcut and suppresses editor shortcuts while the path dialog is open', async () => {
		render(<QueryWorkbench />);
		await connect();
		fireEvent.keyDown(window, {key: 's', ctrlKey: true});
		const dialog = screen.getByRole('dialog', {name: 'Save SQL'});
		const path = within(dialog).getByRole('textbox', {name: 'SQL file path'});
		fireEvent.change(path, {target: {value: '/persist/keyboard.sql'}});
		fireEvent.keyDown(path, {key: 'Enter', ctrlKey: true});
		fireEvent.keyDown(path, {key: 's', metaKey: true});
		expect(screen.getAllByRole('dialog')).toHaveLength(1);
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(bus.writeFile).not.toHaveBeenCalled();
		fireEvent.click(within(dialog).getByRole('button', {name: 'Save'}));
		await waitFor(() => expect(bus.writeFile).toHaveBeenCalledExactlyOnceWith('/persist/keyboard.sql', new TextEncoder().encode('SELECT 1 AS example;')));
	});

	it.each(['Save', 'Load'])('defers URL connection through the %s dialog and file RPC, preserving editor focus while busy', async mode => {
		let resolveTargets, resolveFile;
		bus.queryWorkbenchTargets.mockReturnValueOnce(new Promise(done => {resolveTargets = done;}));
		const fileAction = mode === 'Save' ? bus.writeFile : bus.readFile;
		fileAction.mockReturnValueOnce(new Promise(done => {resolveFile = done;}));
		window.history.replaceState({}, '', `/query-workbench.html?${new URLSearchParams({engine: 'sqlite', target: sqliteTarget, connect: '1'})}`);
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalledOnce());
		const opener = screen.getByRole('button', {name: `${mode} SQL`});
		opener.focus();
		fireEvent.click(opener);
		const dialog = screen.getByRole('dialog', {name: `${mode} SQL`});
		const path = within(dialog).getByRole('textbox', {name: 'SQL file path'});
		expect(path).toHaveFocus();
		fireEvent.change(path, {target: {value: '/persist/pending.sql'}});
		await act(async () => {resolveTargets(installedTargets);});
		expect(bus.queryWorkbenchSchema).not.toHaveBeenCalled();
		expect(fileAction).not.toHaveBeenCalled();
		expect(dialog).toBeInTheDocument();
		fireEvent.click(within(dialog).getByRole('button', {name: mode}));
		await waitFor(() => expect(fileAction).toHaveBeenCalledOnce());
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(opener).toBeDisabled();
		expect(editor.focus).toHaveBeenCalledOnce();
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveFocus();
		expect(bus.queryWorkbenchSchema).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
		expect(screen.getByText(idleResultsText).closest('.result-scroll')).toHaveAttribute('aria-busy', 'false');
		expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
		await act(async () => {resolveFile(new TextEncoder().encode('SELECT 67;'));});
		await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledExactlyOnceWith({engine: 'sqlite', target: sqliteTarget});
		expect(fileAction).toHaveBeenCalledOnce();
		expect(fileAction.mock.calls[0][0]).toBe('/persist/pending.sql');
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue(mode === 'Load' ? 'SELECT 67;' : 'SELECT 1 AS example;');
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('preserves unsaved SQL when loading another file is declined', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(<QueryWorkbench />);
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL query'}), {target: {value: 'SELECT 23;'}});
		fireEvent.click(screen.getByRole('button', {name: 'Load SQL'}));
		const dialog = screen.getByRole('dialog', {name: 'Load SQL'});
		fireEvent.change(within(dialog).getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/another.sql'}});
		fireEvent.click(within(dialog).getByRole('button', {name: 'Load'}));
		await waitFor(() => expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes in this query tab?'));
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 23;');
		expect(bus.readFile).not.toHaveBeenCalled();
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('edits only keyed table preview cells and retains original identity when saving', async () => {
		render(<QueryWorkbench />);
		await preview();
		expect(bus.queryWorkbenchTable).toHaveBeenCalledWith({engine: 'sqlite', target: sqliteTarget, schema: 'main', table: 'items', maxRows: 100});
		expect(screen.queryByRole('button', {name: 'Edit row 1 id'})).not.toBeInTheDocument();
		expect(screen.queryByRole('button', {name: 'Edit row 1 blob'})).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', {name: 'Edit row 1 label'}));
		fireEvent.change(screen.getByRole('textbox', {name: 'Cell value'}), {target: {value: 'after'}});
		fireEvent.click(screen.getByRole('button', {name: 'Save row'}));
		await waitFor(() => expect(bus.queryWorkbenchUpdateRow).toHaveBeenCalledWith({engine: 'sqlite', target: sqliteTarget, schema: 'main', table: 'items', key: {id: 1}, column: 'label', value: 'after', original: 'before'}));
		await waitFor(() => expect(bus.queryWorkbenchTable).toHaveBeenCalledTimes(2));
		expect(screen.queryByRole('textbox', {name: 'Cell value'})).not.toBeInTheDocument();
	});

	it('preserves conflicting row drafts and makes NULL an explicit edit', async () => {
		bus.queryWorkbenchUpdateRow.mockRejectedValueOnce(new Error('Row changed; refresh before editing.'));
		render(<QueryWorkbench />);
		await preview();
		fireEvent.click(screen.getByRole('button', {name: 'Edit row 1 label'}));
		fireEvent.click(screen.getByRole('checkbox', {name: 'Set NULL'}));
		fireEvent.click(screen.getByRole('button', {name: 'Save row'}));
		await screen.findByText(/Row changed/);
		expect(bus.queryWorkbenchUpdateRow).toHaveBeenCalledWith(expect.objectContaining({value: null, original: 'before'}));
		expect(screen.getByRole('checkbox', {name: 'Set NULL'})).toBeChecked();
		expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled();
		fireEvent.click(screen.getByRole('button', {name: 'Cancel edit'}));
		expect(screen.queryByRole('textbox', {name: 'Cell value'})).not.toBeInTheDocument();
	});

	it('leaves tables without a usable key read-only', async () => {
		bus.queryWorkbenchTable.mockResolvedValue({...tableResult, edit: {...tableResult.edit, keyColumns: []}});
		render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByTitle('main.items (table)'));
		fireEvent.click(screen.getByRole('button', {name: 'Select rows'}));
		await screen.findByRole('table');
		expect(screen.queryByRole('button', {name: /Edit row/})).not.toBeInTheDocument();
	});

	it('renders precise integers and binary values without lossy coercion', () => {
		expect(displayCell({type: 'integer', value: '9223372036854775807'})).toBe('9223372036854775807');
		expect(displayCell({type: 'binary', value: '00ff'})).toBe('BLOB: 00ff');
		expect(displayCell('')).toBe('');
		expect(displayCell(0)).toBe('0');
	});

	it('rejects mismatched response identities instead of showing another database result', async () => {
		bus.queryWorkbenchExecute.mockImplementation(async request => ({...request, ...tableResult, target: 'wrong-target'}));
		render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await screen.findByText(/different query or database/);
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
	});

	it('allows an explicit existing SQLite path when discovery is empty', async () => {
		bus.queryWorkbenchTargets.mockResolvedValue([]);
		render(<QueryWorkbench />);
		await screen.findByText(/No installed SQLite databases/);
		expect(screen.getByRole('button', {name: 'Connect'})).toBeDisabled();
		fireEvent.change(screen.getByRole('textbox', {name: 'SQLite database path'}), {target: {value: sqliteTarget}});
		await connect();
		expect(bus.queryWorkbenchSchema).toHaveBeenCalledWith({engine: 'sqlite', target: sqliteTarget});
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('does not overwrite an existing SQL file after a declined confirmation', async () => {
		bus.analyzePath.mockResolvedValue({exists: true});
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(<QueryWorkbench />);
		fireEvent.click(screen.getByRole('button', {name: 'Save SQL'}));
		fireEvent.click(within(screen.getByRole('dialog', {name: 'Save SQL'})).getByRole('button', {name: 'Save'}));
		await waitFor(() => expect(window.confirm).toHaveBeenCalledWith('Replace /persist/query.sql?'));
		expect(bus.writeFile).not.toHaveBeenCalled();
	});

	it('supports keyboard tab navigation and hiding the navigator', async () => {
		render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByRole('button', {name: '+ Query tab'}));
		fireEvent.keyDown(screen.getByRole('tab', {name: /Query 2/}), {key: 'ArrowLeft'});
		expect(screen.getByRole('tab', {name: /Query 1/})).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tab', {name: /Query 1/})).toHaveFocus();
		fireEvent.click(screen.getByRole('button', {name: 'Toggle schemas'}));
		expect(screen.getByRole('button', {name: 'Toggle schemas'})).toHaveAttribute('aria-expanded', 'false');
	});

	it('does not leave a retryable row draft after a successful write but failed refresh', async () => {
		render(<QueryWorkbench />);
		await preview();
		bus.queryWorkbenchTable.mockRejectedValueOnce(new Error('Refresh failed after write'));
		fireEvent.click(screen.getByRole('button', {name: 'Edit row 1 label'}));
		fireEvent.click(screen.getByRole('button', {name: 'Save row'}));
		await screen.findByText(/Refresh failed after write/);
		expect(screen.queryByRole('textbox', {name: 'Cell value'})).not.toBeInTheDocument();
		expect(bus.queryWorkbenchUpdateRow).toHaveBeenCalledOnce();
	});

	it.each([null, undefined, {type: 'binary', value: '00ff'}])('never offers row editing with an unusable key cell %j', async key => {
		bus.queryWorkbenchTable.mockResolvedValue({...tableResult, results: [{...tableResult.results[0], rows: [[key, 'before', null]]}]});
		render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByTitle('main.items (table)'));
		fireEvent.click(screen.getByRole('button', {name: 'Select rows'}));
		await screen.findByRole('table');
		expect(screen.queryByRole('button', {name: /Edit row/})).not.toBeInTheDocument();
	});

	it('supports resizing the editor and collapsing results', async () => {
		render(<QueryWorkbench />);
		await connect();
		fireEvent.change(screen.getByRole('slider', {name: 'Editor height'}), {target: {value: '70'}});
		expect(screen.getByRole('tabpanel')).toHaveStyle('--editor-share: 70%');
		fireEvent.click(screen.getByRole('button', {name: 'Hide results'}));
		expect(screen.getByRole('button', {name: 'Show results'})).toHaveAttribute('aria-expanded', 'false');
		fireEvent.click(screen.getByRole('button', {name: 'Result Grid'}));
		expect(screen.getByRole('button', {name: 'Hide results'})).toHaveAttribute('aria-expanded', 'true');
	});

	it('invalidates late results on controller change while preserving SQL and waiting for the reply', async () => {
		let resolve;
		bus.queryWorkbenchExecute.mockImplementation(request => new Promise(done => {resolve = () => done({...request, ...tableResult});}));
		render(<QueryWorkbench />);
		await connect();
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL query'}), {target: {value: 'SELECT 47;'}});
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await waitFor(() => expect(bus.queryWorkbenchExecute).toHaveBeenCalledOnce());
		act(() => {navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));});
		expect(screen.getByRole('button', {name: 'Connect'})).toBeDisabled();
		expect(screen.getByRole('status')).toHaveTextContent('Run query');
		await act(async () => {resolve();});
		expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled();
		expect(screen.getByRole('button', {name: 'Connect'})).toBeEnabled();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
		expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 47;');
		expect(screen.getByText(/Service worker changed. Reconnect/)).toBeInTheDocument();
	});

	it('preserves an uncertain row-write draft across controller change without retrying', async () => {
		let resolve;
		bus.queryWorkbenchUpdateRow.mockImplementation(() => new Promise(done => {resolve = () => done({affectedRows: 1});}));
		render(<QueryWorkbench />);
		await preview();
		fireEvent.click(screen.getByRole('button', {name: 'Edit row 1 label'}));
		fireEvent.change(screen.getByRole('textbox', {name: 'Cell value'}), {target: {value: 'uncertain'}});
		expect(screen.getByRole('combobox', {name: 'Database engine'})).toBeDisabled();
		expect(screen.getByRole('textbox', {name: 'SQLite database path'})).toBeDisabled();
		fireEvent.click(screen.getByRole('button', {name: 'Save row'}));
		await waitFor(() => expect(bus.queryWorkbenchUpdateRow).toHaveBeenCalledOnce());
		act(() => {navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));});
		await act(async () => {resolve();});
		expect(screen.getByRole('textbox', {name: 'Cell value'})).toHaveValue('uncertain');
		expect(screen.getByRole('button', {name: 'Save row'})).toBeDisabled();
		expect(bus.queryWorkbenchTable).toHaveBeenCalledOnce();
		expect(bus.queryWorkbenchUpdateRow).toHaveBeenCalledOnce();
	});
});
