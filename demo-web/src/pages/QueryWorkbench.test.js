import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

const {bus, getPhpBus, editor} = vi.hoisted(() => {
	const bus = {queryWorkbenchTargets: vi.fn(), queryWorkbenchSchema: vi.fn(), queryWorkbenchExecute: vi.fn(), queryWorkbenchTable: vi.fn(), queryWorkbenchUpdateRow: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), analyzePath: vi.fn()};
	return {bus, getPhpBus: vi.fn(async () => bus), editor: {getSelectedText: vi.fn(() => '')}};
});

vi.mock('../lib/phpBus', () => ({getPhpBus}));
vi.mock('../components/Header', () => ({default: () => <div>Header</div>}));
vi.mock('ace-builds/src-noconflict/mode-sql', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-monokai', () => ({}));
vi.mock('react-ace', () => ({default: function AceMock({value, onChange, onLoad, readOnly}) {
	React.useEffect(() => {onLoad(editor);}, [onLoad]);
	return <textarea aria-label="SQL query" value={value} onChange={event => onChange(event.target.value)} readOnly={readOnly} />;
}}));

import QueryWorkbench, {displayCell} from './QueryWorkbench';

const sqliteTarget = '/persist/workbench.sqlite';
const pgTarget = 'idb://host=drupal-11-pg18 dbname=postgres port=5432';
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
	fireEvent.click(screen.getByText('main.items'));
	fireEvent.click(screen.getByRole('button', {name: 'Select rows'}));
	await screen.findByRole('button', {name: 'Edit row 1 label'});
};

describe('QueryWorkbench', () => {
	beforeEach(() => {
		Object.defineProperty(navigator, 'serviceWorker', {configurable: true, value: new EventTarget()});
		vi.clearAllMocks();
		bus.queryWorkbenchTargets.mockResolvedValue([{engine: 'sqlite', target: sqliteTarget, label: 'Test SQLite'}, {engine: 'pgsql', target: pgTarget, label: 'Drupal PostgreSQL'}]);
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
		render(<QueryWorkbench />);
		await connect();
		vi.useFakeTimers();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await act(async () => {await Promise.resolve();});
		await act(async () => {vi.advanceTimersByTime(10001);});
		expect(screen.getByRole('status')).toHaveTextContent('Still running');
		fireEvent.keyDown(window, {key: 'Enter', metaKey: true});
		expect(bus.queryWorkbenchExecute).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole('button', {name: '+ Query tab'}));
		await act(async () => {resolve();});
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('tab', {name: /Query 1/}));
		expect(screen.getByRole('table')).toBeInTheDocument();
	});

	it('reports execution failure and allows retry after a real reply', async () => {
		bus.queryWorkbenchExecute.mockRejectedValueOnce(new Error('syntax error near SELECT'));
		render(<QueryWorkbench />);
		await connect();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		expect(await screen.findByText(/syntax error near SELECT/)).toBeInTheDocument();
		expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled();
		fireEvent.click(screen.getByRole('button', {name: 'Run'}));
		await screen.findByRole('table');
	});

	it('opens and saves SQL through the current worker without executing it', async () => {
		render(<QueryWorkbench />);
		await waitFor(() => expect(bus.queryWorkbenchTargets).toHaveBeenCalled());
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/example.sql'}});
		fireEvent.click(screen.getByRole('button', {name: 'Open SQL'}));
		await waitFor(() => expect(screen.getByRole('textbox', {name: 'SQL query'})).toHaveValue('SELECT 42;'));
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL query'}), {target: {value: 'SELECT 43;'}});
		fireEvent.keyDown(window, {key: 's', metaKey: true});
		await waitFor(() => expect(bus.writeFile).toHaveBeenCalledWith('/persist/example.sql', new TextEncoder().encode('SELECT 43;')));
		expect(bus.queryWorkbenchExecute).not.toHaveBeenCalled();
	});

	it('never writes SQL files outside /persist or over PHP source', async () => {
		render(<QueryWorkbench />);
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/../index.php'}});
		fireEvent.click(screen.getByRole('button', {name: 'Save SQL'}));
		await screen.findByText(/Choose a .sql file inside/);
		expect(bus.writeFile).not.toHaveBeenCalled();
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
		fireEvent.click(screen.getByText('main.items'));
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
		fireEvent.click(screen.getByText('main.items'));
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
