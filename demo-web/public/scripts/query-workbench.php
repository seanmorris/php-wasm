<?php

/**
 * SQLite adapter for the demo query workbench. The CGI caller supplies JSON,
 * never generated PHP. Each request has its own connection: transactions,
 * attached databases and connection-local settings are deliberately unsupported.
 */
function query_workbench_skip_comments(string $sql): string
{
    while (true) {
        $sql = ltrim($sql, " \t\r\n\v\f");
        if (str_starts_with($sql, '--')) {
            $end = strpos($sql, "\n");
            $sql = $end === false ? '' : substr($sql, $end + 1);
        } elseif (str_starts_with($sql, '/*')) {
            $end = strpos($sql, '*/', 2);
            // SQLite treats an unterminated trailing block comment as a comment.
            $sql = $end === false ? '' : substr($sql, $end + 2);
        } else {
            return $sql;
        }
    }
}

function query_workbench_target(string $target, string $persistRoot): string
{
    $root = realpath($persistRoot);
    $path = str_contains($target, "\0") ? false : realpath($target);
    if (!$root || !$path || !str_starts_with($path, $root . '/') || !is_file($path)) {
        throw new InvalidArgumentException('Select an existing SQLite database file under /persist.');
    }

    $file = fopen($path, 'rb');
    if ($file === false) {
        throw new InvalidArgumentException('The selected SQLite database cannot be read.');
    }
    try {
        if (fread($file, 16) !== "SQLite format 3\0") {
            throw new InvalidArgumentException('The selected file is not an initialized SQLite database.');
        }
    } finally {
        fclose($file);
    }
    return $path;
}

function query_workbench_validate_sql(string $path, string $sql): void
{
    if ($sql === '' || strlen($sql) > 65536 || str_contains($sql, "\0")) {
        throw new InvalidArgumentException('Enter one SQL statement (maximum 64 KiB, without NUL bytes).');
    }
    $start = query_workbench_skip_comments($sql);
    if (!preg_match('/^([a-z]+)/i', $start, $match)) {
        throw new InvalidArgumentException('Enter one complete SQL statement.');
    }
    if (in_array(strtoupper($match[1]), [
        'BEGIN', 'END', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE',
        'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM',
    ], true)) {
        throw new InvalidArgumentException('Transactions, PRAGMA, VACUUM and connection-local commands are not supported.');
    }

    // SQLite's own parser identifies the actual statement boundary, including
    // quoted semicolons and CREATE TRIGGER bodies. A regex SQL splitter cannot.
    // This validation connection is read-only and never steps the statement.
    $db = new SQLite3($path, SQLITE3_OPEN_READONLY);
    $statement = null;
    try {
        $db->enableExceptions(true);
        $db->busyTimeout(3000);
        $unsupported = false;
        $db->setAuthorizer(static function ($action, $first, $second) use (&$unsupported) {
            if (in_array($action, [
                SQLite3::ATTACH, SQLite3::DETACH, SQLite3::TRANSACTION,
                SQLite3::SAVEPOINT, SQLite3::PRAGMA, SQLite3::CREATE_TEMP_TABLE,
                SQLite3::CREATE_TEMP_VIEW, SQLite3::CREATE_TEMP_INDEX,
                SQLite3::CREATE_TEMP_TRIGGER,
            ], true) || ($action === SQLite3::FUNCTION && in_array(strtolower($second ?? ''), [
                'load_extension', 'readfile', 'writefile',
            ], true))) {
                $unsupported = true;
                return SQLite3::DENY;
            }
            return SQLite3::OK;
        });

        try {
            $statement = $db->prepare($sql);
        } catch (Throwable $error) {
            if ($unsupported) {
                throw new InvalidArgumentException('This statement uses unsupported connection-local state or filesystem access.');
            }
            throw $error;
        }
        if (!$statement) {
            throw new InvalidArgumentException('Enter one complete SQL statement.');
        }
        $prepared = $statement->getSQL(false);
        if (!$prepared || !str_starts_with($sql, $prepared)
            || query_workbench_skip_comments(substr($sql, strlen($prepared))) !== '') {
            throw new InvalidArgumentException('Run one statement at a time; select the statement you want to execute.');
        }
        if ($statement->paramCount() !== 0) {
            throw new InvalidArgumentException('Unbound SQL parameters are not supported; enter SQL literals.');
        }
    } finally {
        if ($statement) {
            $statement->close();
        }
        $db->close();
    }
}

function query_workbench_cell($value, array $meta)
{
    if ($value === null) {
        return null;
    }
    if (in_array('blob', $meta['flags'] ?? [], true)
        || (is_string($value) && !preg_match('//u', $value))) {
        return ['type' => 'binary', 'value' => base64_encode($value)];
    }
    if (($meta['native_type'] ?? '') === 'integer') {
        // PDO SQLite returns out-of-range 64-bit integers as strings on wasm32.
        // Keep all integers as decimal text across PHP -> JSON -> JavaScript.
        return ['type' => 'integer', 'value' => (string) $value];
    }
    if (is_float($value) && !is_finite($value)) {
        return ['type' => 'numeric', 'value' => (string) $value];
    }
    return $value;
}

function query_workbench_schema(PDO $db): array
{
    $tables = $db->query("SELECT name, type FROM main.sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
    $columns = $db->prepare('SELECT name, type FROM pragma_table_xinfo(:name) ORDER BY cid');
    $schema = [];
    $bytes = 2;
    try {
        while (($table = $tables->fetch(PDO::FETCH_ASSOC)) !== false) {
            if (count($schema) >= 1000) {
                throw new RuntimeException('Schema exceeds the workbench limit of 1000 tables/views.');
            }
            $entry = ['schema' => 'main', 'name' => $table['name'], 'type' => $table['type'], 'columns' => []];
            $columns->execute(['name' => $table['name']]);
            while (($column = $columns->fetch(PDO::FETCH_ASSOC)) !== false) {
                if (count($entry['columns']) >= 2000) {
                    throw new RuntimeException('Schema exceeds the workbench column limit.');
                }
                $entry['columns'][] = ['name' => $column['name'], 'type' => $column['type']];
            }
            $columns->closeCursor();
            $bytes += strlen(json_encode($entry, JSON_THROW_ON_ERROR));
            if ($bytes > 1048576) {
                throw new RuntimeException('Schema exceeds the workbench 1 MiB display limit.');
            }
            $schema[] = $entry;
        }
    } finally {
        $columns->closeCursor();
        $tables->closeCursor();
    }
    return $schema;
}

function query_workbench_execute(PDO $db, string $sql, int $maxRows): array
{
    $statement = $db->prepare($sql);
    $rows = [];
    $columns = [];
    $truncated = false;
    $bytes = 2;
    try {
        $statement->execute();
        for ($index = 0; $index < $statement->columnCount(); ++$index) {
            $meta = $statement->getColumnMeta($index);
            $columns[] = [
                'name' => $meta['name'],
                'type' => $meta['sqlite:decl_type'] ?? $meta['native_type'] ?? '',
            ];
        }
        $bytes += strlen(json_encode($columns, JSON_THROW_ON_ERROR));
        if ($bytes > 1048576) {
            throw new RuntimeException('Result columns exceed the workbench 1 MiB display limit.');
        }
        // No LIMIT rewriting: it would change writes/RETURNING and SQL semantics.
        // Fetch at most one row beyond the display limit to detect truncation.
        while (($row = $statement->fetch(PDO::FETCH_NUM)) !== false) {
            if (count($rows) >= $maxRows) {
                $truncated = true;
                break;
            }
            foreach ($row as $index => &$value) {
                // SQLite is dynamically typed: metadata can differ on every row.
                $value = query_workbench_cell($value, $statement->getColumnMeta($index));
            }
            unset($value);
            $bytes += strlen(json_encode($row, JSON_THROW_ON_ERROR)) + 1;
            if ($bytes > 1048576) {
                $truncated = true;
                break;
            }
            $rows[] = $row;
        }
    } finally {
        $statement->closeCursor();
    }
    $changes = $db->query('SELECT changes()');
    try {
        $affectedRows = (int) $changes->fetchColumn();
    } finally {
        $changes->closeCursor();
    }
    return ['results' => [[
        'columns' => $columns,
        'rows' => $rows,
        'affectedRows' => $affectedRows,
        'returnedRows' => count($rows),
        'truncated' => $truncated,
    ]]];
}

function query_workbench_identifier(string $name): string
{
    return '"' . str_replace('"', '""', $name) . '"';
}

function query_workbench_table_metadata(PDO $db, array $request): array
{
    if (($request['schema'] ?? 'main') !== 'main' || !is_string($request['table'] ?? null)
        || $request['table'] === '' || str_contains($request['table'], "\0")) {
        throw new InvalidArgumentException('Select a table in the main SQLite schema.');
    }
    $table = $request['table'];
    $lookup = $db->prepare("SELECT type FROM main.sqlite_schema WHERE name = :name AND type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
    $lookup->execute(['name' => $table]);
    $kind = $lookup->fetchColumn();
    $lookup->closeCursor();
    if ($kind === false) {
        throw new InvalidArgumentException('The selected table or view no longer exists.');
    }

    $columnQuery = $db->prepare('SELECT name, type, pk, hidden FROM pragma_table_xinfo(:name) ORDER BY cid');
    $columnQuery->execute(['name' => $table]);
    $columns = $columnQuery->fetchAll(PDO::FETCH_ASSOC);
    $columnQuery->closeCursor();
    $byName = [];
    $primary = [];
    foreach ($columns as $column) {
        $byName[$column['name']] = $column;
        if ((int) $column['pk'] > 0) {
            $primary[(int) $column['pk']] = $column['name'];
        }
    }
    ksort($primary);
    $key = $kind === 'table' ? array_values($primary) : [];
    if ($kind === 'table' && !$key) {
        $indexQuery = $db->prepare('SELECT name FROM pragma_index_list(:name) WHERE "unique" = 1 AND partial = 0 ORDER BY seq');
        $indexQuery->execute(['name' => $table]);
        $indexes = $indexQuery->fetchAll(PDO::FETCH_COLUMN);
        $indexQuery->closeCursor();
        $indexColumns = $db->prepare('SELECT name, cid FROM pragma_index_xinfo(:name) WHERE "key" = 1 ORDER BY seqno');
        foreach ($indexes as $index) {
            $indexColumns->execute(['name' => $index]);
            $candidate = $indexColumns->fetchAll(PDO::FETCH_ASSOC);
            $indexColumns->closeCursor();
            if ($candidate && !array_filter($candidate, static fn ($column) =>
                (int) $column['cid'] < 0 || !isset($byName[$column['name']])
            )) {
                $key = array_column($candidate, 'name');
                break;
            }
        }
    }
    // A generated or binary identity is not an editable grid key in this v1.
    foreach ($key as $name) {
        if ((int) $byName[$name]['hidden'] !== 0 || stripos($byName[$name]['type'], 'BLOB') !== false) {
            $key = [];
            break;
        }
    }
    $editable = [];
    if ($key) {
        foreach ($columns as $column) {
            if (!in_array($column['name'], $key, true) && (int) $column['hidden'] === 0
                && stripos($column['type'], 'BLOB') === false) {
                $editable[] = $column['name'];
            }
        }
    }
    return ['schema' => 'main', 'table' => $table, 'keyColumns' => $key, 'editableColumns' => $editable];
}

function query_workbench_bind_cell(PDOStatement $statement, string $parameter, $value): void
{
    $statement->bindValue($parameter, $value, $value === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
}

/** Return SQL and storage type for an original grid value, plus bound text. */
function query_workbench_original($cell, string $parameter): array
{
    if ($cell === null) {
        return [$parameter, 'null', null];
    }
    if (is_string($cell)) {
        return [$parameter, 'text', $cell];
    }
    if (is_array($cell) && ($cell['type'] ?? '') === 'integer' && is_string($cell['value'] ?? null)) {
        $value = $cell['value'];
        $unsigned = ltrim($value, '-');
        $limit = str_starts_with($value, '-') ? '9223372036854775808' : '9223372036854775807';
        if (preg_match('/^-?(?:0|[1-9][0-9]*)$/D', $value) && strlen($unsigned) <= 19
            && (strlen($unsigned) < 19 || strcmp($unsigned, $limit) <= 0)) {
            return ['CAST(' . $parameter . ' AS INTEGER)', 'integer', $value];
        }
    }
    // JSON decodes integral-looking REAL values as PHP integers. REAL casts
    // preserve their SQLite storage type without narrowing on wasm32.
    if ((is_int($cell) || is_float($cell)) && is_finite((float) $cell)) {
        return ['CAST(' . $parameter . ' AS REAL)', 'real', json_encode($cell, JSON_THROW_ON_ERROR)];
    }
    throw new InvalidArgumentException('Binary, non-finite and unsupported original cell values are read-only.');
}

function query_workbench_update(PDO $db, array $request): array
{
    if (!is_array($request['key'] ?? null) || !is_string($request['column'] ?? null)
        || !array_key_exists('original', $request) || !array_key_exists('value', $request)
        || ($request['value'] !== null && !is_string($request['value']))) {
        throw new InvalidArgumentException('An update requires a row key, column, original value and text or null replacement.');
    }
    $db->beginTransaction();
    try {
        // Metadata and update share a transaction so a concurrent schema change
        // cannot invalidate the key/column checks between these operations.
        $edit = query_workbench_table_metadata($db, $request);
        if (!$edit['keyColumns'] || !in_array($request['column'], $edit['editableColumns'], true)
            || count($request['key']) !== count($edit['keyColumns'])) {
            throw new InvalidArgumentException('This table, key or column is read-only.');
        }
        $conditions = [];
        $bindings = [':replacement' => $request['value']];
        foreach ($edit['keyColumns'] as $index => $name) {
            if (!array_key_exists($name, $request['key']) || $request['key'][$name] === null) {
                throw new InvalidArgumentException('All original non-null key values are required.');
            }
            $parameter = ':key' . $index;
            [$expression, $type, $value] = query_workbench_original($request['key'][$name], $parameter);
            $quoted = query_workbench_identifier($name);
            $conditions[] = 'typeof(' . $quoted . ') = ' . $parameter . '_type AND ' . $quoted . ' IS ' . $expression . ' COLLATE BINARY';
            $bindings[$parameter] = $value;
            $bindings[$parameter . '_type'] = $type;
        }
        $column = query_workbench_identifier($request['column']);
        [$expression, $type, $original] = query_workbench_original($request['original'], ':original');
        $conditions[] = 'typeof(' . $column . ') = :original_type AND ' . $column . ' IS ' . $expression . ' COLLATE BINARY';
        $bindings[':original'] = $original;
        $bindings[':original_type'] = $type;
        $sql = 'UPDATE main.' . query_workbench_identifier($edit['table']) . ' SET ' . $column
            . ' = :replacement WHERE ' . implode(' AND ', $conditions);
        $statement = $db->prepare($sql);
        try {
            foreach ($bindings as $parameter => $value) {
                query_workbench_bind_cell($statement, $parameter, $value);
            }
            $statement->execute();
            $affectedRows = $statement->rowCount();
        } finally {
            $statement->closeCursor();
        }
        if ($affectedRows !== 1) {
            throw new RuntimeException('Update conflict: the row changed or its key is no longer unique. Reload the table before editing.');
        }
        $db->commit();
        return ['affectedRows' => 1];
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
}

function query_workbench_handle(array $request, string $persistRoot = '/persist'): array
{
    if (($request['engine'] ?? '') !== 'sqlite' || !is_string($request['target'] ?? null)) {
        throw new InvalidArgumentException('A SQLite engine and database file target are required.');
    }
    $action = $request['action'] ?? 'execute';
    if (!in_array($action, ['execute', 'schema', 'table', 'update'], true)) {
        throw new InvalidArgumentException('Unsupported query workbench action.');
    }
    $path = query_workbench_target($request['target'], $persistRoot);
    $maxRows = $request['maxRows'] ?? 200;
    if (!is_int($maxRows) || $maxRows < 1 || $maxRows > 1000) {
        throw new InvalidArgumentException('The row limit must be an integer between 1 and 1000.');
    }
    if ($action === 'execute') {
        if (!is_string($request['sql'] ?? null)) {
            throw new InvalidArgumentException('SQL must be a string.');
        }
        query_workbench_validate_sql($path, $request['sql']);
    }
    $db = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 3,
        // Never create a file if it disappeared since validation.
        PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READWRITE,
    ]);
    try {
        // The grid must not bypass relational integrity just because it uses a
        // fresh PDO connection rather than the application's initialized one.
        $db->exec('PRAGMA foreign_keys = ON');
        if ($action === 'schema') {
            return query_workbench_schema($db);
        }
        if ($action === 'table') {
            $edit = query_workbench_table_metadata($db, $request);
            $order = $edit['keyColumns'] ? ' ORDER BY ' . implode(', ', array_map('query_workbench_identifier', $edit['keyColumns'])) : '';
            $result = query_workbench_execute($db, 'SELECT * FROM main.' . query_workbench_identifier($edit['table']) . $order, $maxRows);
            return $result + ['edit' => $edit];
        }
        if ($action === 'update') {
            return query_workbench_update($db, $request);
        }
        return query_workbench_execute($db, $request['sql'], $maxRows);
    } finally {
        $db = null;
    }
}

// Keeping the request boundary separate permits native and wasm regression tests
// to exercise exactly the same adapter without a second query implementation.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    ini_set('display_errors', '0');
    set_error_handler(static function ($severity, $message, $file, $line) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    });
    try {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            header('Allow: POST');
            throw new InvalidArgumentException('Use a JSON POST request.');
        }
        $input = file_get_contents('php://input', false, null, 0, 131073);
        if ($input === false || strlen($input) > 131072) {
            throw new InvalidArgumentException('Request exceeds the 128 KiB limit.');
        }
        $request = json_decode($input, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($request) || array_is_list($request)) {
            throw new InvalidArgumentException('Request must be a JSON object.');
        }
        $result = query_workbench_handle($request);
        echo json_encode($result, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (Throwable $error) {
        if (http_response_code() !== 405) {
            http_response_code($error instanceof InvalidArgumentException || $error instanceof JsonException ? 400 : 422);
        }
        echo json_encode(['error' => [
            'message' => $error->getMessage(),
            'code' => (string) $error->getCode(),
        ]], JSON_INVALID_UTF8_SUBSTITUTE);
    } finally {
        restore_error_handler();
    }
}
