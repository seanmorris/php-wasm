/**
 * SQL workbench for the demo's existing browser-local databases.
 */
import '../styles/Common.css';
import '../styles/QueryWorkbench.css';

import {useCallback, useEffect, useRef, useState} from 'react';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-monokai';
import Header from '../components/Header';
import QuerySqlFileDialog from '../components/QuerySqlFileDialog';
import {getPhpBus} from '../lib/phpBus';
import toggleIcon from '../assets/nuvola/view_choose.png';
import saveIcon from '../assets/nuvola/3floppy_unmount.png';
import openIcon from '../assets/nomo-dark/folder.open.svg';
import databaseIcon from '../assets/icons/rolodex-icon-32.png';

const engineLabel = engine => engine === 'pgsql' ? 'PostgreSQL' : 'SQLite';
const errorMessage = error => String(error?.message ?? error?.error ?? error);
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;
const hasEditableKey = (result, row, edit) => !!edit?.keyColumns?.length && edit.keyColumns.every(name => {
	const index = result.columns.findIndex(column => column.name === name);
	return index >= 0 && row[index] !== null && row[index] !== undefined && row[index]?.type !== 'binary';
});

const makeTab = (id, engine = 'sqlite', target = '') => ({
	id
	, engine
	, target
	, name: `Query ${id}`
	, sql: 'SELECT 1 AS example;'
	, path: '/persist/query.sql'
	, savedPath: ''
	, dirty: false
	, connected: false
	, schema: []
	, results: []
	, output: []
	, edit: null, preview: null, rowDraft: null
});

/**
 * Preserves typed values and NULL without coercing large integers through Number.
 */
export function displayCell(cell)
{
	if(cell === null)
	{
		return 'NULL';
	}

	if(typeof cell === 'object')
	{
		return cell.type === 'binary' ? `BLOB: ${cell.value}` : cell.value;
	}

	return String(cell);
}

/**
 * Builds an editor-style schema, SQL, results, and action-output workspace.
 */
export default function QueryWorkbench()
{
	const [requestedConnection] = useState(() => {
		const query = new URLSearchParams(window.location.search);
		return query.get('connect') === '1' && ['sqlite', 'pgsql'].includes(query.get('engine')) && query.get('target')
			? {engine: query.get('engine'), target: query.get('target')}
			: null;
	});
	const pendingConnection = useRef(requestedConnection);
	const [tabs, setTabs] = useState(() => {
		const query = new URLSearchParams(window.location.search);
		return [makeTab(1, query.get('engine') === 'pgsql' ? 'pgsql' : 'sqlite', query.get('target') ?? '')];
	});
	const [activeId, setActiveId] = useState(1);
	const [targets, setTargets] = useState([]);
	const [targetError, setTargetError] = useState('');
	const [loadingTargets, setLoadingTargets] = useState(true);
	const [busy, setBusy] = useState(null);
	const [showSchemas, setShowSchemas] = useState(true);
	const [maxRows, setMaxRows] = useState(100);
	const [outputPanel, setOutputPanel] = useState('results');
	const [editorShare, setEditorShare] = useState(50);
	const [resultsCollapsed, setResultsCollapsed] = useState(false);
	const [horizontalScroll, setHorizontalScroll] = useState(true);
	const [fileDialog, setFileDialog] = useState(null);
	const focusEditorAfterDialog = useRef(false);
	const nextId = useRef(2);
	const operation = useRef(null);
	const editor = useRef(null);
	const mounted = useRef(true);
	const controllerGeneration = useRef(0);
	const active = tabs.find(tab => tab.id === activeId) ?? tabs[0];

	const updateTab = useCallback((id, update) => {
		if(mounted.current)
		{
			setTabs(current => current.map(tab => tab.id === id ? {...tab, ...update} : tab));
		}
	}, []);

	const appendOutput = useCallback((id, message, failed = false) => {
		if(mounted.current)
		{
			setTabs(current => current.map(tab => tab.id === id ? {
				...tab, output: [...tab.output.slice(-29), {message, failed}]
			} : tab));
		}
	}, []);

	const refreshTargets = useCallback(async () => {
		const generation = controllerGeneration.current;
		setLoadingTargets(true);
		setTargetError('');
		try
		{
			const bus = await getPhpBus();
			const found = await bus.queryWorkbenchTargets();
			if(mounted.current && generation === controllerGeneration.current)
			{
				setTargets(found);
				setTabs(current => current.map(tab => tab.target ? tab : {
					...tab, target: found.find(target => target.engine === tab.engine)?.target ?? ''
				}));
			}
		}
		catch(error)
		{
			if(mounted.current && generation === controllerGeneration.current)
			{
				setTargetError(errorMessage(error));
			}
		}
		finally
		{
			if(mounted.current && generation === controllerGeneration.current)
			{
				setLoadingTargets(false);
			}
		}
	}, []);

	useEffect(() => {
		mounted.current = true;
		void refreshTargets();
		return () => { mounted.current = false; };
	}, [refreshTargets]);

	useEffect(() => {
		const changed = () => {
			controllerGeneration.current++;
			setTargets([]);
			setTabs(current => current.map(tab => ({
				...tab, connected: false, schema: [], results: [], edit: null
				, output: [...tab.output.slice(-29), {failed: true, message: 'Service worker changed. Reconnect and inspect the database before retrying. A pending action may already have completed; unsaved SQL and row drafts are preserved. Copy or cancel a preserved row draft before editing again.'}]
			})));
			setOutputPanel('output');
			setResultsCollapsed(false);
			void refreshTargets();
		};
		navigator.serviceWorker?.addEventListener('controllerchange', changed);
		return () => navigator.serviceWorker?.removeEventListener('controllerchange', changed);
	}, [refreshTargets]);

	useEffect(() => {
		const query = new URLSearchParams();
		query.set('engine', active.engine);
		if(active.target)
		{
			query.set('target', active.target);
		}
		window.history.replaceState({}, '', `${window.location.pathname}?${query}`);
	}, [active.engine, active.target]);

	useEffect(() => {
		const warnBeforeUnload = event => {
			if(tabs.some(tab => tab.dirty || tab.rowDraft) || operation.current)
			{
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', warnBeforeUnload);
		return () => window.removeEventListener('beforeunload', warnBeforeUnload);
	}, [tabs]);

	/** A slow RPC is still running; never drop its reply or pretend to cancel it. */
	const perform = useCallback(async (tab, label, callback) => {
		if(operation.current)
		{
			return;
		}
		const token = {generation: controllerGeneration.current};
		const ensureCurrent = () => {
			if(token.generation !== controllerGeneration.current)
			{
				throw new Error('The service worker changed before this action replied. Its result was discarded; the action may already have completed.');
			}
		};
		operation.current = token;
		setBusy({tabId: tab.id, label, slow: false});
		const timer = setTimeout(() => {
			if(mounted.current && operation.current === token)
			{
				setBusy({tabId: tab.id, label, slow: true});
			}
		}, 10000);
		try
		{
			const bus = await getPhpBus();
			ensureCurrent();
			await callback(bus, ensureCurrent);
		}
		catch(error)
		{
			appendOutput(tab.id, `${label}: ${errorMessage(error)}`, true);
			if(mounted.current)
			{
				setOutputPanel('output');
				setResultsCollapsed(false);
			}
		}
		finally
		{
			clearTimeout(timer);
			operation.current = null;
			if(mounted.current)
			{
				setBusy(null);
			}
		}
	}, [appendOutput]);

	const connect = useCallback(() => {
		pendingConnection.current = null;
		return perform(active, 'Connect', async (bus, ensureCurrent) => {
			updateTab(active.id, {connected: false, schema: []});
			const schema = await bus.queryWorkbenchSchema({engine: active.engine, target: active.target});
			ensureCurrent();
			updateTab(active.id, {schema, connected: true});
			appendOutput(active.id, `Connected to ${engineLabel(active.engine)}: ${active.target}`);
		});
	}, [active, perform, updateTab, appendOutput]);

	useEffect(() => {
		const request = pendingConnection.current;
		if(!request) return;
		if(active.id !== 1 || active.engine !== request.engine || active.target !== request.target)
		{
			pendingConnection.current = null;
			return;
		}
		if(loadingTargets || busy || fileDialog) return;
		pendingConnection.current = null;
		if(targetError) return;
		// A framework DB link opens schema metadata once, never SQL from the URL.
		// The worker validates that the explicitly requested database already exists.
		void connect();
	}, [active, loadingTargets, busy, fileDialog, targetError, connect]);

	const run = useCallback(() => {
		if(!active.connected || operation.current || active.rowDraft)
		{
			return;
		}
		const selection = editor.current?.getSelectedText?.();
		const sql = selection?.trim() ? selection : active.sql;
		if(!sql.trim())
		{
			return;
		}
		const requestId = globalThis.crypto.randomUUID();
		return perform(active, 'Run query', async (bus, ensureCurrent) => {
			updateTab(active.id, {results: [], edit: null, preview: null, rowDraft: null});
			const response = await bus.queryWorkbenchExecute({
				requestId, engine: active.engine, target: active.target, sql, maxRows
			});
			ensureCurrent();
			if(response.requestId !== requestId || response.engine !== active.engine || response.target !== active.target)
			{
				throw new Error('The worker returned a result for a different query or database.');
			}
			updateTab(active.id, {results: response.results});
			appendOutput(active.id, `Query completed in ${Math.round(response.elapsedMs)} ms on ${engineLabel(active.engine)}: ${active.target}`);
			if(mounted.current)
			{
				setOutputPanel('results');
				setResultsCollapsed(false);
			}
		});
	}, [active, maxRows, perform, updateTab, appendOutput]);

	const sqlFilePath = path => {
		if(!path.startsWith('/persist/') || !path.endsWith('.sql') || path.includes('\0') || path.split('/').some(part => part === '.' || part === '..'))
		{
			throw new Error('Choose a .sql file inside /persist/ (its parent folder must already exist).');
		}
		return path;
	};

	const openSql = (requestedPath, tab) => perform(tab, 'Open SQL', async (bus, ensureCurrent) => {
		const path = sqlFilePath(requestedPath);
		if(tab.dirty && !window.confirm('Discard unsaved changes in this query tab?'))
		{
			return;
		}
		const data = await bus.readFile(path);
		ensureCurrent();
		const sql = typeof data === 'string' ? data : new TextDecoder().decode(data);
		updateTab(tab.id, {sql, path, name: path.split('/').pop(), savedPath: path, dirty: false});
		appendOutput(tab.id, `Opened ${path}`);
	});

	const saveSql = useCallback((requestedPath, tab) => perform(tab, 'Save SQL', async (bus, ensureCurrent) => {
		const path = sqlFilePath(requestedPath);
		if(path !== tab.savedPath)
		{
			const existing = await bus.analyzePath(path);
			ensureCurrent();
			if(existing.exists && !window.confirm(`Replace ${path}?`))
			{
				return;
			}
		}
		await bus.writeFile(path, new TextEncoder().encode(tab.sql));
		ensureCurrent();
		updateTab(tab.id, {path, name: path.split('/').pop(), savedPath: path, dirty: false});
		appendOutput(tab.id, `Saved ${path}`);
	}), [perform, updateTab, appendOutput]);

	const chooseSqlFile = mode => setFileDialog({mode, tabId: active.id, path: active.path});
	const confirmSqlFile = path => {
		const tab = tabs.find(tab => tab.id === fileDialog.tabId);
		focusEditorAfterDialog.current = true;
		setFileDialog(null);
		if(tab)
		{
			void (fileDialog.mode === 'save' ? saveSql(path, tab) : openSql(path, tab));
		}
	};

	useEffect(() => {
		if(!fileDialog && focusEditorAfterDialog.current)
		{
			focusEditorAfterDialog.current = false;
			// The toolbar opener is disabled during the file RPC; keep keyboard focus in the editor.
			editor.current?.focus();
		}
	}, [fileDialog]);

	useEffect(() => {
		const handleKey = event => {
			if(fileDialog)
			{
				if((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key.toLowerCase() === 's'))
				{
					event.preventDefault();
				}
				return;
			}
			if((event.ctrlKey || event.metaKey) && event.key === 'Enter')
			{
				event.preventDefault();
				void run();
			}
			if((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's')
			{
				event.preventDefault();
				if(!operation.current)
				{
					if(active.savedPath)
					{
						void saveSql(active.savedPath, active);
					}
					else
					{
						setFileDialog({mode: 'save', tabId: active.id, path: active.path});
					}
				}
			}
		};
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	}, [active, fileDialog, run, saveSql]);

	const addTab = () => {
		pendingConnection.current = null;
		const tab = makeTab(nextId.current++, active.engine, active.target);
		setTabs(current => [...current, tab]);
		setActiveId(tab.id);
	};
	const closeTab = tab => {
		if(busy?.tabId === tab.id || ((tab.dirty || tab.rowDraft) && !window.confirm('Discard unsaved changes in this query tab?')))
		{
			return;
		}
		const remaining = tabs.filter(item => item.id !== tab.id);
		if(!remaining.length)
		{
			remaining.push(makeTab(nextId.current++, tab.engine, tab.target));
		}
		setTabs(remaining);
		if(activeId === tab.id)
		{
			setActiveId(remaining[0].id);
		}
	};
	const handleTabKey = (event, id) => {
		const index = tabs.findIndex(tab => tab.id === id);
		const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
			: event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
				: event.key === 'Home' ? 0
					: event.key === 'End' ? tabs.length - 1 : null;
		if(next !== null)
		{
			event.preventDefault();
			setActiveId(tabs[next].id);
			document.getElementById(`query-tab-${tabs[next].id}`)?.focus();
		}
	};
	const changeTarget = (engine, target) => {
		pendingConnection.current = null;
		updateTab(active.id, {
			engine
			, target
			, connected: false
			, schema: []
			, results: []
			, edit: null
			, preview: null
			, rowDraft: null
		});
	};
	const previewTable = table => {
		if(operation.current)
		{
			return;
		}
		const qualified = [table.schema, table.name].filter(Boolean).map(quoteIdentifier).join('.');
		const tab = {...makeTab(nextId.current++, active.engine, active.target)
			, name: table.name
			, sql: `SELECT * FROM ${qualified} LIMIT ${maxRows};`
			, connected: active.connected
			, schema: active.schema};
		setTabs(current => [...current, tab]);
		setActiveId(tab.id);
		void perform(tab, 'Select rows', async (bus, ensureCurrent) => {
			const preview = {engine: tab.engine, target: tab.target, schema: table.schema, table: table.name, maxRows};
			const response = await bus.queryWorkbenchTable(preview);
			ensureCurrent();
			updateTab(tab.id, {results: response.results, edit: response.edit, preview});
			appendOutput(tab.id, `Selected rows from ${qualified}.`);
			if(mounted.current)
			{
				setOutputPanel('results');
				setResultsCollapsed(false);
			}
		});
	};
	const beginRowEdit = (row, rowIndex, column, columnIndex) => {
		const original = row[columnIndex];
		const key = Object.fromEntries(active.edit.keyColumns.map(name => [name, row[active.results[0].columns.findIndex(item => item.name === name)]]));
		updateTab(active.id, {rowDraft: {rowIndex, column, key, original, value: original === null ? '' : displayCell(original), isNull: original === null}});
	};
	const saveRow = () => {
		const draft = active.rowDraft;
		if(!draft || !active.edit || !active.connected)
		{
			return;
		}
		void perform(active, 'Save row', async (bus, ensureCurrent) => {
			await bus.queryWorkbenchUpdateRow({engine: active.engine, target: active.target, schema: active.edit.schema, table: active.edit.table, key: draft.key, column: draft.column, value: draft.isNull ? null : draft.value, original: draft.original});
			ensureCurrent();
			// The write has completed. Clear the draft before a separately fallible refresh.
			updateTab(active.id, {rowDraft: null, results: [], edit: null});
			appendOutput(active.id, `Saved ${draft.column} in ${active.edit.table}.`);
			const response = await bus.queryWorkbenchTable(active.preview);
			ensureCurrent();
			updateTab(active.id, {results: response.results, edit: response.edit});
		});
	};
	const availableTargets = targets.filter(target => target.engine === active.engine);
	const knownTarget = availableTargets.some(target => target.target === active.target);
	const loadingResults = busy?.tabId === active.id && ['Run query', 'Select rows', 'Save row'].includes(busy.label);

	return <div className="query-workbench viewport-page" data-show-schemas={showSchemas}>
		<div className="bevel">
			<Header />
			<div className="workbench-heading"><img src={databaseIcon} alt="" /><h1>Query Workbench</h1><span>Browser-local databases</span></div>
			<div className="workbench-toolbar row toolbar inset tight">
				<button className="square" title="Toggle schemas" aria-label="Toggle schemas" aria-controls="query-schemas" aria-expanded={showSchemas} onClick={() => setShowSchemas(value => !value)}><img src={toggleIcon} alt="" /></button>
				<button onClick={addTab}>+ Query tab</button>
				<button className="sql-file-action" aria-label="Save SQL" onClick={() => chooseSqlFile('save')} disabled={!!busy}><img src={saveIcon} alt="" />Save</button>
				<button className="sql-file-action" aria-label="Load SQL" onClick={() => chooseSqlFile('load')} disabled={!!busy}><img src={openIcon} alt="" />Load</button>
				<button aria-label="Run" onClick={() => void run()} disabled={!!busy || !!active.rowDraft || !active.connected || !active.sql.trim()} title="Run selection or buffer (Ctrl/Cmd+Enter)">▶ Run</button>
				<label><span>Row limit</span><select className="bevel" aria-label="Row limit" value={maxRows} onChange={event => setMaxRows(Number(event.target.value))} disabled={!!busy}><option value={100}>100</option><option value={500}>500</option><option value={1000}>1000</option></select></label>
				<span className="query-hint">One statement · Ctrl/Cmd+Enter to run selection or buffer</span>
			</div>
			<div className="workbench-body">
				<aside id="query-schemas" className="schema-panel inset" aria-label="Database navigator">
					<h2>Connection</h2>
					<label htmlFor="query-engine">Database engine</label>
					<select id="query-engine" value={active.engine} disabled={!!busy || !!active.rowDraft} onChange={event => changeTarget(event.target.value, targets.find(target => target.engine === event.target.value)?.target ?? '')}>
						<option value="sqlite">SQLite</option><option value="pgsql">PostgreSQL / PGlite · Slow</option>
					</select>
					<label htmlFor="query-target">Installed database</label>
					<select id="query-target" value={knownTarget ? active.target : ''} disabled={!!busy || !!active.rowDraft || loadingTargets} onChange={event => changeTarget(active.engine, event.target.value)}>
						<option value="">{loadingTargets ? 'Finding databases…' : active.engine === 'sqlite' ? 'Choose database or enter path' : 'Choose an installed database'}</option>
						{availableTargets.map(target => <option value={target.target} key={target.target}>{target.label}</option>)}
					</select>
					{active.engine === 'sqlite' && <><label htmlFor="query-sqlite-path">SQLite database path</label><input id="query-sqlite-path" value={active.target} placeholder="/persist/example.sqlite" disabled={!!busy || !!active.rowDraft} onChange={event => changeTarget('sqlite', event.target.value)} /></>}
					{active.engine === 'pgsql' && <p className="connection-hint">PostgreSQL startup can be slow. Install a PostgreSQL demo first.</p>}
					<div className="connection-actions"><button onClick={() => void connect()} disabled={!!busy || !!active.rowDraft || !active.target}>{active.connected ? 'Refresh schema' : 'Connect'}</button><button onClick={() => void refreshTargets()} disabled={!!busy || loadingTargets} aria-label="Refresh databases">↻</button></div>
					{targetError && <p role="alert">{targetError}</p>}
					{!loadingTargets && !availableTargets.length && <p className="connection-hint">No installed {engineLabel(active.engine)} databases found.{active.engine === 'sqlite' && ' Enter the path of an existing database.'}</p>}
					<h2>Schemas <span>{active.connected ? '●' : '○'}</span></h2>
					<div className="schema-tree">
						{!active.connected && <p>Connect to inspect tables and views. No database is created automatically.</p>}
						{active.connected && !active.schema.length && <p>No tables or views.</p>}
						{active.schema.map(table => <details key={`${table.schema}.${table.name}`}>
							<summary title={table.type}>{table.schema ? `${table.schema}.` : ''}{table.name}</summary>
							<button className="preview-table" onClick={() => previewTable(table)} disabled={!!busy}>Select rows</button>
							<ul>{table.columns.map(column => <li key={column.name}><span>{column.name}</span><small>{column.type}</small></li>)}</ul>
						</details>)}
					</div>
				</aside>
				<main className="query-main">
					<div className="query-tabs inset" role="tablist" aria-label="Query tabs">
						{tabs.map(tab => <div className="query-tab" key={tab.id} data-active={tab.id === activeId}>
							<button role="tab" id={`query-tab-${tab.id}`} aria-controls="query-panel" aria-selected={tab.id === activeId} tabIndex={tab.id === activeId ? 0 : -1} onKeyDown={event => handleTabKey(event, tab.id)} onClick={() => setActiveId(tab.id)} title={`${engineLabel(tab.engine)}: ${tab.target || 'No database selected'}`}>{tab.name}{tab.dirty ? ' *' : ''} <small>{engineLabel(tab.engine)}</small></button>
							<button aria-label={`Close ${tab.name}`} onClick={() => closeTab(tab)} disabled={busy?.tabId === tab.id}>×</button>
						</div>)}
					</div>
					<section id="query-panel" className="query-panel" role="tabpanel" aria-labelledby={`query-tab-${active.id}`} style={{'--editor-share': `${editorShare}%`}}>
						<div className="query-connection-strip" title={active.target}><span>{active.connected ? '● Connected' : '○ Not connected'} · {engineLabel(active.engine)}</span><span>{active.target || 'Choose an existing database'}</span></div>
						<div className="sql-editor inset">
							<AceEditor key={active.id} name="query-editor" mode="sql" theme="monokai" value={active.sql} onChange={sql => updateTab(active.id, {sql, dirty: true})} onLoad={instance => {editor.current = instance; instance.textInput?.getElement().setAttribute('aria-label', 'SQL query');}} width="100%" height="100%" fontSize={14} showPrintMargin={false} setOptions={{useWorker: false}} readOnly={!!busy} />
						</div>
						<div className="query-results inset" data-collapsed={resultsCollapsed}>
							{outputPanel === 'results' ? <div className="result-scroll" data-horizontal-scroll={horizontalScroll} aria-busy={loadingResults}>
								{!active.results.length && <p className="result-placeholder">{loadingResults ? 'Loading…' : 'Results appear here. SQL runs only when you click Run.'}</p>}
								{active.results.map((result, index) => <section key={index}>
									<p className="result-summary">{result.returnedRows} rows returned{result.affectedRows !== null && result.affectedRows !== undefined ? ` · ${result.affectedRows} rows affected` : ''}{result.truncated ? ' · Result truncated at the row or size limit' : ''}</p>
									<p className="result-summary">{active.edit?.keyColumns?.length ? 'Table preview: click a value to edit. Key and binary columns are read-only.' : 'Read-only results. To edit rows, select a table with a usable key from Schemas.'}</p>
									{!!result.columns.length && <table aria-label={`Query result ${index + 1}`}><thead><tr><th scope="col">#</th>{result.columns.map((column, columnIndex) => <th scope="col" key={columnIndex} title={column.type}>{column.name}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{row.map((cell, columnIndex) => <td key={columnIndex} className={cell === null ? 'null-cell' : ''} title={cell === null ? 'SQL NULL' : undefined}>{index === 0 && hasEditableKey(result, row, active.edit) && active.edit.editableColumns.includes(result.columns[columnIndex].name) && !active.edit.keyColumns.includes(result.columns[columnIndex].name) && cell?.type !== 'binary' ? <button className="editable-cell" disabled={!!busy || !!active.rowDraft} aria-label={`Edit row ${rowIndex + 1} ${result.columns[columnIndex].name}`} onClick={() => beginRowEdit(row, rowIndex, result.columns[columnIndex].name, columnIndex)}>{displayCell(cell) || '\u00a0'}</button> : displayCell(cell)}</td>)}</tr>)}</tbody></table>}
								</section>)}
							</div> : <section className="action-output" aria-label="Action output"><ol>{active.output.map((entry, index) => <li key={index} className={entry.failed ? 'failed' : ''}>{entry.message}</li>)}</ol>{!active.output.length && <p>No actions yet.</p>}</section>}
							{active.rowDraft && <form className="row-edit inset" aria-label="Edit row" onSubmit={event => {event.preventDefault(); saveRow();}}>
								<label className="row-edit-field">Row {active.rowDraft.rowIndex + 1} · {active.rowDraft.column}<input aria-label="Cell value" value={active.rowDraft.value} disabled={!!busy || active.rowDraft.isNull} onChange={event => updateTab(active.id, {rowDraft: {...active.rowDraft, value: event.target.value}})} /></label>
								<div className="row-edit-actions">
									<label><input type="checkbox" checked={active.rowDraft.isNull} disabled={!!busy} onChange={event => updateTab(active.id, {rowDraft: {...active.rowDraft, isNull: event.target.checked}})} />Set NULL</label>
									<button disabled={!!busy || !active.connected || !active.edit} type="submit">Save row</button><button disabled={!!busy} type="button" onClick={() => updateTab(active.id, {rowDraft: null})}>Cancel edit</button>
								</div>
							</form>}
							<div className="result-toolbar row toolbar tight"><button aria-pressed={outputPanel === 'results'} onClick={() => {setOutputPanel('results'); setResultsCollapsed(false);}}>Result Grid</button><button aria-pressed={outputPanel === 'output'} onClick={() => {setOutputPanel('output'); setResultsCollapsed(false);}}>{`Action Output (${active.output.length})`}</button><label className="result-scroll-toggle"><input type="checkbox" checked={horizontalScroll} onChange={event => setHorizontalScroll(event.target.checked)} />Horizontal scroll</label><label className="editor-size">Editor height<input type="range" aria-label="Editor height" min={20} max={80} value={editorShare} onChange={event => setEditorShare(Number(event.target.value))} /></label><button aria-label={resultsCollapsed ? 'Show results' : 'Hide results'} aria-expanded={!resultsCollapsed} onClick={() => setResultsCollapsed(value => !value)}>{resultsCollapsed ? '▴' : '▾'}</button></div>
						</div>
					</section>
				</main>
			</div>
			<div className="workbench-status inset" role="status">{busy ? `${busy.label} (Query ${busy.tabId})…${busy.slow ? ' Still running; waiting for the worker. Closing this page does not cancel the query.' : ''}` : 'Ready. Queries change the demo database immediately; saved SQL files do not include database data.'}</div>
		</div>
		{fileDialog && <div className="overlay"><QuerySqlFileDialog mode={fileDialog.mode} initialPath={fileDialog.path} onConfirm={confirmSqlFile} onCancel={() => setFileDialog(null)} /></div>}
	</div>;
}
