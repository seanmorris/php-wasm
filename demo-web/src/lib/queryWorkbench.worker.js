import { drupalPgsqlDatabase } from './drupalDatabase.js';

export const workbenchLimits = Object.freeze({maxRows: 1000, maxBytes: 1024 * 1024, maxSqlBytes: 65536});
const encoder = new TextEncoder();
const limitRows = value => Math.min(workbenchLimits.maxRows, Math.max(1, Math.trunc(Number(value) || 200)));
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;

/** Inspect an existing IDBFS store without initializing an absent database. */
export const postgresStoreExists = async target => {
	const name = `/pglite/${target.slice(6)}`;
	if(!(await indexedDB.databases()).some(db => db.name === name)) return false;
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onupgradeneeded = () => request.transaction.abort();
		request.onerror = () => reject(new Error('PostgreSQL store is unavailable. It may have been cleared.'));
		request.onsuccess = () => {
			const db = request.result;
			if(!db.objectStoreNames.contains('FILE_DATA'))
			{ db.close(); resolve(false); return; }
			const tx = db.transaction('FILE_DATA', 'readonly');
			const read = tx.objectStore('FILE_DATA').get(`${name}/PG_VERSION`);
			let exists = false;
			read.onsuccess = () => { exists = !!read.result; };
			tx.oncomplete = () => { db.close(); resolve(exists); };
			tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Unable to inspect the PostgreSQL store.')); };
		};
	});
};

const postgresTypes = async pg => {
	const types = await pg.query('SELECT oid, typname FROM pg_catalog.pg_type');
	return {
		typeNames: new Map(types.rows.map(type => [type.oid, type.typname]))
		, parsers: Object.fromEntries(types.rows.map(type => [type.oid, value => value]))
	};
};

const validateTable = input => {
	for(const value of [input.schema, input.table])
	{
		if(typeof value !== 'string' || !value || value.includes('\0') || value.length > 255) throw new Error('Select a valid table.');
	}
};

const tableMetadata = async (pg, {schema, table}) => {
	const {rows: columns} = await pg.query(`
		SELECT a.attname AS name, a.atttypid AS oid, a.attgenerated AS generated, a.attidentity AS identity, c.relkind, c.relhassubclass
		FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
		WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'v', 'm', 'p') ORDER BY a.attnum
	`, [schema, table]);
	if(!columns.length) throw new Error('Table is missing or has no visible columns.');
	let keyColumns = [];
	if(columns[0].relkind === 'p' || (columns[0].relkind === 'r' && !columns[0].relhassubclass))
	{
		const {rows: keys} = await pg.query(`
			SELECT i.indexrelid, a.attname AS name
			FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			JOIN pg_catalog.pg_index i ON i.indrelid = c.oid
			JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ordinal) ON k.ordinal <= i.indnkeyatts
			JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
			WHERE n.nspname = $1 AND c.relname = $2 AND i.indisunique AND i.indisvalid AND i.indisready
				AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL
			ORDER BY i.indisprimary DESC, i.indexrelid, k.ordinal
		`, [schema, table]);
		keyColumns = keys.filter(key => key.indexrelid === keys[0]?.indexrelid).map(key => key.name);
		if(columns.some(column => keyColumns.includes(column.name) && column.oid === 17)) keyColumns = [];
	}
	return {
		schema, table, keyColumns
		, editableColumns: keyColumns.length ? columns.filter(column => !keyColumns.includes(column.name)
			&& !column.generated && !column.identity && column.oid !== 17).map(column => column.name) : []
	};
};

const bindOriginal = cell => {
	if(cell === null || typeof cell === 'string') return cell;
	if(typeof cell === 'boolean') return cell ? 't' : 'f';
	if(typeof cell === 'number' && Number.isSafeInteger(cell)) return String(cell);
	if(cell && ['integer', 'numeric', 'json'].includes(cell.type) && typeof cell.value === 'string') return cell.value;
	throw new Error('Unsupported original cell value. Reload the table preview.');
};
const sessionCommands = new Set([
	'BEGIN', 'START', 'COMMIT', 'END', 'ROLLBACK', 'ABORT', 'SAVEPOINT', 'RELEASE'
	, 'SET', 'RESET', 'DISCARD', 'PREPARE', 'EXECUTE', 'DEALLOCATE', 'DECLARE'
	, 'FETCH', 'MOVE', 'CLOSE', 'LISTEN', 'UNLISTEN', 'COPY'
]);

/** Reads the first PostgreSQL token, respecting nested leading comments. */
export const leadingSqlKeyword = sql => {
	let offset = 0;
	while(offset < sql.length)
	{
		if(/\s/.test(sql[offset]))
		{ offset++; continue; }
		if(sql.startsWith('--', offset))
		{
			const end = sql.indexOf('\n', offset + 2);
			offset = end < 0 ? sql.length : end + 1;
			continue;
		}
		if(sql.startsWith('/*', offset))
		{
			let depth = 1;
			offset += 2;
			while(offset < sql.length && depth)
			{
				if(sql.startsWith('/*', offset))
				{ depth++; offset += 2; }
				else if(sql.startsWith('*/', offset))
				{ depth--; offset += 2; }
				else offset++;
			}
			if(depth) throw new Error('Unterminated SQL comment.');
			continue;
		}
		break;
	}
	return sql.slice(offset).match(/^[a-z]+/i)?.[0].toUpperCase() ?? '';
};

export const validateWorkbenchTarget = ({engine, target} = {}) => {
	if(!['sqlite', 'pgsql'].includes(engine)) throw new Error('Select SQLite or PostgreSQL.');
	if(typeof target !== 'string' || target.length > 4096 || target.includes('\0')) throw new Error('Invalid database target.');
	if(engine === 'pgsql' && target !== drupalPgsqlDatabase) throw new Error('Select an installed local PostgreSQL demo database.');
	if(engine === 'sqlite' && (!target.startsWith('/persist/') || target.split('/').some(part => part === '..' || part === '.')))
	{
		throw new Error('Select an existing SQLite file under /persist.');
	}
	return {engine, target};
};

const postgresCell = (value, oid) => {
	if(value === null) return null;
	if(oid === 16) return value === 't';
	if(oid === 20) return {type: 'integer', value};
	if(oid === 1700) return {type: 'numeric', value};
	if(oid === 114 || oid === 3802) return {type: 'json', value};
	if(oid === 17)
	{
		// bytea's default hex output; retain its explicit encoding for display.
		return {type: 'binary', value, encoding: 'hex'};
	}
	// Text protocol values preserve custom types, dates, arrays and numerics
	// without the default JS parser's precision/timezone coercions.
	return value;
};

export const normalizePostgresResult = (result, typeNames, maxRows) => {
	const columns = result.fields.map(field => ({name: field.name, type: typeNames.get(field.dataTypeID) || String(field.dataTypeID)}));
	const rows = [];
	let bytes = encoder.encode(JSON.stringify(columns)).byteLength;
	if(bytes > workbenchLimits.maxBytes) throw new Error('Result columns exceed the 1 MiB display limit.');
	for(const row of result.rows)
	{
		if(rows.length >= maxRows) break;
		const cells = row.map((value, index) => postgresCell(value, result.fields[index].dataTypeID));
		const size = encoder.encode(JSON.stringify(cells)).byteLength;
		if(bytes + size > workbenchLimits.maxBytes) break;
		rows.push(cells);
		bytes += size;
	}
	return {columns, rows, affectedRows: result.affectedRows ?? 0, returnedRows: rows.length, truncated: rows.length < result.rows.length};
};

/** Worker actions with injected ownership and CGI bridges for focused tests. */
export const createWorkbenchActions = ({withLock, withPGlite, postgresExists = postgresStoreExists}) => {
	const requirePostgres = async target => {
		if(!await postgresExists(target))
		{
			throw new Error('PostgreSQL demo database is not installed. Start the Drupal PostgreSQL demo first.');
		}
	};
	const postgres = (target, callback) => withLock(async () => {
		await requirePostgres(target);
		return withPGlite(target, callback);
	});

	return {
		queryWorkbenchTargets: php => withLock(async () => {
			const targets = [];
			for(const [target, label] of [
				['/persist/drupal-11.4.5/web/sites/default/files/.sqlite', 'Drupal / SQLite']
				, ['/persist/wordpress-7.1/wp-content/database/.ht.sqlite', 'WordPress / SQLite']
			]){
				const info = await php.analyzePath(target);
				if(info.exists && !info.object?.isFolder) targets.push({engine: 'sqlite', target, label});
			}
			if(await postgresExists(drupalPgsqlDatabase))
			{
				targets.push({engine: 'pgsql', target: drupalPgsqlDatabase, label: 'Drupal / PostgreSQL (PGlite)'});
			}
			return targets;
		})

		, queryWorkbenchSchema: (php, input) => {
			const {engine, target} = validateWorkbenchTarget(input);
			if(engine === 'sqlite') return php.queryWorkbenchSqlite({action: 'schema', engine, target});
			return postgres(target, async pg => {
				const {rows} = await pg.query(`
					SELECT n.nspname AS schema, c.relname AS name,
						CASE WHEN c.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END AS type,
						a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS column_type
					FROM pg_catalog.pg_class c
					JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
					LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
					WHERE c.relkind IN ('r', 'v', 'm', 'p')
						AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
					ORDER BY n.nspname, c.relname, a.attnum
				`);
				const tables = new Map();
				for(const row of rows)
				{
					const key = JSON.stringify([row.schema, row.name]);
					if(!tables.has(key)) tables.set(key, {schema: row.schema, name: row.name, type: row.type, columns: []});
					if(row.column_name !== null) tables.get(key).columns.push({name: row.column_name, type: row.column_type});
				}
				const schema = [...tables.values()];
				if(schema.length > 1000 || encoder.encode(JSON.stringify(schema)).byteLength > workbenchLimits.maxBytes)
				{
					throw new Error('Schema exceeds the workbench display limit (1000 tables/views or 1 MiB).');
				}
				return schema;
			});
		}

		, queryWorkbenchTable: async (php, input) => {
			const {engine, target} = validateWorkbenchTarget(input);
			validateTable(input);
			const maxRows = limitRows(input.maxRows);
			const started = performance.now();
			const result = engine === 'sqlite'
				? await php.queryWorkbenchSqlite({...input, action: 'table', maxRows})
				: await postgres(target, async pg => {
					const edit = await tableMetadata(pg, input);
					const {typeNames, parsers} = await postgresTypes(pg);
					const order = edit.keyColumns.length ? ` ORDER BY ${edit.keyColumns.map(quoteIdentifier).join(', ')}` : '';
					const result = await pg.query(`SELECT * FROM ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)}${order} LIMIT $1`, [maxRows + 1], {rowMode: 'array', parsers});
					return {results: [normalizePostgresResult(result, typeNames, maxRows)], edit};
				});
			return {...result, engine, target, elapsedMs: Math.round(performance.now() - started)};
		}

		, queryWorkbenchUpdateRow: async (php, input) => {
			const {engine, target} = validateWorkbenchTarget(input);
			validateTable(input);
			if(typeof input.column !== 'string' || (input.value !== null && typeof input.value !== 'string')) throw new Error('Invalid cell edit.');
			if(input.value !== null && encoder.encode(input.value).byteLength > 65536) throw new Error('Cell value exceeds the 64 KiB edit limit.');
			if(engine === 'sqlite') return php.queryWorkbenchSqlite({...input, action: 'update'});
			return postgres(target, pg => pg.transaction(async tx => {
				const metadata = await tableMetadata(tx, input);
				if(!metadata.keyColumns.length || !metadata.editableColumns.includes(input.column)) throw new Error('This cell is read-only. A verified key and writable column are required.');
				if(!input.key || Object.keys(input.key).length !== metadata.keyColumns.length) throw new Error('The complete row key is required.');
				const params = [input.value];
				const conditions = metadata.keyColumns.map(name => {
					const value = bindOriginal(input.key[name]);
					if(value === null) throw new Error('Rows with NULL keys are read-only.');
					params.push(value);
					return `${quoteIdentifier(name)} IS NOT DISTINCT FROM $${params.length}`;
				});
				params.push(bindOriginal(input.original));
				// Type output matches the raw result protocol, unlike ::text (which
				// trims CHAR padding). Preserve NULL separately from empty text.
				const column = quoteIdentifier(input.column);
				conditions.push(`(CASE WHEN ${column} IS NULL THEN NULL ELSE pg_catalog.format('%s', ${column}) END) COLLATE "C" IS NOT DISTINCT FROM $${params.length}::text COLLATE "C"`);
				const result = await tx.query(`UPDATE ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)} SET ${quoteIdentifier(input.column)} = $1 WHERE ${conditions.join(' AND ')} RETURNING 1`, params);
				if(result.affectedRows !== 1) throw new Error('Edit conflict: the row was changed or removed. Reload the preview before editing again.');
				return {affectedRows: 1};
			}));
		}

		, queryWorkbenchExecute: async (php, input) => {
			const {engine, target} = validateWorkbenchTarget(input);
			const {sql, requestId} = input;
			if(typeof requestId !== 'string' || requestId.length > 128) throw new Error('Invalid query request ID.');
			if(typeof sql !== 'string' || !sql.trim()) throw new Error('Enter one SQL statement to run.');
			if(sql.includes('\0') || encoder.encode(sql).byteLength > workbenchLimits.maxSqlBytes) throw new Error('SQL is too large or contains a NUL character.');
			const maxRows = limitRows(input.maxRows);
			const started = performance.now();
			let results;
			if(engine === 'sqlite')
			{
				({results} = await php.queryWorkbenchSqlite({action: 'execute', engine, target, sql, maxRows}));
			}
			else
			{
				const keyword = leadingSqlKeyword(sql);
				if(!keyword || sessionCommands.has(keyword)) throw new Error('Run one standalone statement; transaction/session commands and COPY are not supported.');
				results = await postgres(target, async pg => {
					const {typeNames, parsers} = await postgresTypes(pg);
					// query uses PostgreSQL's extended protocol Parse, which rejects
					// multiple statements before executing any of them. Do not use exec.
					const result = await pg.query(sql, [], {rowMode: 'array', parsers});
					return [normalizePostgresResult(result, typeNames, maxRows)];
				});
			}
			return {requestId, engine, target, results, elapsedMs: Math.round(performance.now() - started)};
		}
	};
};
