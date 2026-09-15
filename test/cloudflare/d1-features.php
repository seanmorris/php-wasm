<?php
// Executed by the local workerd harness against the freshly packaged PHP artifact.
$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

switch ($feature) {
    case 'parameters':
        $stmt = $pdo->prepare("SELECT :name AS first, :name AS repeated, :optional AS optional, ':ignored ?99' AS literal -- :comment");
        $stmt->execute(['name' => "O'Reilly", ':optional' => null]);
        $first = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->execute(['name' => 'again', 'optional' => 'present']);
        $second = $stmt->fetch(PDO::FETCH_NUM);
        $stmt = $pdo->prepare('SELECT ?3 AS third, ?1 AS first, ?3 AS repeated, ? AS fourth');
        $stmt->execute(['one', null, 'three', 'four']);
        $numbered = $stmt->fetch(PDO::FETCH_NUM);
        $stmt = $pdo->prepare('SELECT ?3 AS third, ?1 AS first, ? AS fourth');
        $stmt->bindValue(3, 3, PDO::PARAM_INT);
        $stmt->bindValue(1, 1, PDO::PARAM_INT);
        $stmt->bindValue(4, 4, PDO::PARAM_INT);
        $stmt->execute(); $gaps = $stmt->fetch(PDO::FETCH_NUM);
        $stmt = $pdo->prepare('SELECT :value AS value');
        $value = 7; $stmt->bindParam(':value', $value, PDO::PARAM_INT);
        $stmt->execute(); $before = $stmt->fetchColumn();
        $value = '9'; $stmt->execute(); $after = $stmt->fetchColumn();
        echo json_encode([$first, $second, $numbered, $gaps, $before, $after]);
        break;

    case 'direct':
        $initial = $pdo->lastInsertId();
        $created = $pdo->exec('CREATE TABLE direct_features(id INTEGER PRIMARY KEY, name TEXT)');
        $name = "O'Reilly — café";
        $inserted = $pdo->exec('INSERT INTO direct_features(name) VALUES (' . $pdo->quote($name) . ')');
        $firstId = $pdo->lastInsertId();
        $other = new PDO('cfd1:mainDb');
        $other->exec("INSERT INTO direct_features(name) VALUES ('other')");
        $read = $pdo->query('SELECT name FROM direct_features WHERE id = 1')->fetchColumn();
        $afterRead = $pdo->lastInsertId();
        $pdo->exec("UPDATE direct_features SET name = 'changed' WHERE id = 2");
        $afterUpdate = $pdo->lastInsertId();
        $script = $pdo->exec("INSERT INTO direct_features(name) VALUES ('a'); INSERT INTO direct_features(name) VALUES ('b');");
        $scriptId = $pdo->lastInsertId();
        $pdo->exec("INSERT INTO direct_features(id, name) VALUES (4294967297, 'wide')");
        $wideId = $pdo->lastInsertId();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
        $failure = $pdo->exec('INSERT INTO table_that_does_not_exist VALUES (1)');
        $error = $pdo->errorInfo()[0]; $afterFailure = $pdo->lastInsertId();
        $badQuote = $pdo->quote("a" . chr(0) . "b"); $quoteError = $pdo->errorInfo()[0];
        echo json_encode([$initial, $created, $inserted, $firstId, $other->lastInsertId(), $read,
            $afterRead, $afterUpdate, $script, $scriptId, $wideId, $failure, $error, $afterFailure, $badQuote, $quoteError]);
        break;

    case 'insert-id-safety':
        $pdo->exec('CREATE TABLE unsafe_id_features(id INTEGER PRIMARY KEY)');
        $written = $pdo->exec('INSERT INTO unsafe_id_features(id) VALUES (9007199254740993)');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
        $id = $pdo->lastInsertId(); $idError = $pdo->errorInfo()[0];
        $stored = $pdo->query('SELECT CAST(id AS TEXT) FROM unsafe_id_features')->fetchColumn();
        $insert = $pdo->prepare('INSERT INTO unsafe_id_features(id) VALUES (9007199254740995) RETURNING CAST(id AS TEXT) AS id');
        $batched = $pdo->cfd1Batch([$insert]);
        $batchId = $pdo->lastInsertId(); $batchError = $pdo->errorInfo()[0];
        echo json_encode([$written, $id, $idError, $stored, $batched, $batchId, $batchError, $insert->fetchColumn()]);
        break;

    case 'blobs':
        $pdo->exec('CREATE TABLE blob_features(id INTEGER PRIMARY KEY, payload BLOB, note TEXT)');
        $bytes = hex2bin('0080ff27414200');
        $stmt = $pdo->prepare('INSERT INTO blob_features(payload, note) VALUES (:payload, :note)');
        $stmt->bindValue('payload', $bytes, PDO::PARAM_LOB);
        $stmt->bindValue('note', "before" . chr(0) . "after", PDO::PARAM_STR);
        $stmt->execute();
        $stream = fopen('php://temp', 'w+b'); fwrite($stream, 'xx' . $bytes); fseek($stream, 2);
        $stmt->bindParam('payload', $stream, PDO::PARAM_LOB); $stmt->execute();
        $stmt->bindValue('payload', '', PDO::PARAM_LOB); $stmt->execute();
        $stmt->bindValue('payload', null, PDO::PARAM_LOB); $stmt->execute();
        $pdo->exec('INSERT INTO blob_features(payload) VALUES (' . $pdo->quote($bytes, PDO::PARAM_LOB) . ')');
        $rows = $pdo->query('SELECT payload, note, typeof(payload) AS kind FROM blob_features ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
        $result = [];
        foreach ($rows as $row) $result[] = [$row['payload'] === null ? null : bin2hex($row['payload']),
            $row['note'] === null ? null : bin2hex($row['note']), $row['kind']];
        $empty = fopen('php://temp', 'w+b'); $stmt->bindValue('payload', $empty, PDO::PARAM_LOB); $stmt->execute();
        $emptyRead = $pdo->query('SELECT length(payload) FROM blob_features WHERE id = 6')->fetchColumn();
        $bad = fopen('/write-only-blob', 'wb'); $stmt->bindValue('payload', $bad, PDO::PARAM_LOB);
        try { $stmt->execute(); $rejected = false; } catch (PDOException $error) { $rejected = $error->errorInfo[0] === 'HY105'; }
        fclose($bad); fclose($empty); fclose($stream);
        echo json_encode([$result, $emptyRead, $rejected]);
        break;

    case 'results':
        try { $pdo->getAttribute(PDO::ATTR_SERVER_VERSION); $versionUnavailable = false; }
        catch (PDOException $error) { $versionUnavailable = $error->errorInfo[0] === 'HYC00'; }
        $attributes = [$pdo->getAttribute(PDO::ATTR_DRIVER_NAME), $pdo->getAttribute(PDO::ATTR_AUTOCOMMIT),
            $pdo->getAttribute(PDO::ATTR_EMULATE_PREPARES), strlen($pdo->getAttribute(PDO::ATTR_CLIENT_VERSION)) > 0,
            $versionUnavailable,
            $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false), $pdo->setAttribute(PDO::ATTR_AUTOCOMMIT, true)];
        $pdo->setAttribute(PDO::ATTR_CASE, PDO::CASE_UPPER);
        $stmt = $pdo->prepare('SELECT 1 AS value UNION ALL SELECT 2 UNION ALL SELECT 3', [PDO::ATTR_CURSOR => PDO::CURSOR_SCROLL]);
        $stmt->bindColumn('VALUE', $bound, PDO::PARAM_INT);
        $stmt->execute();
        $meta = $stmt->getColumnMeta(0);
        $metadata = [$meta['name'], $meta['native_type'], $meta['pdo_type'] === PDO::PARAM_INT,
            isset($meta['table']), isset($meta['driver:decl_type']), $stmt->getAttribute(PDO::ATTR_CURSOR) === PDO::CURSOR_SCROLL];
        $rows = [];
        foreach ([[PDO::FETCH_ORI_NEXT, 0], [PDO::FETCH_ORI_LAST, 0], [PDO::FETCH_ORI_PRIOR, 0],
            [PDO::FETCH_ORI_FIRST, 0], [PDO::FETCH_ORI_ABS, 2], [PDO::FETCH_ORI_REL, 1],
            [PDO::FETCH_ORI_PRIOR, 0], [PDO::FETCH_ORI_ABS, -1], [PDO::FETCH_ORI_NEXT, 0]] as $position) {
            $row = $stmt->fetch(PDO::FETCH_ASSOC, $position[0], $position[1]); $rows[] = $row === false ? false : $row['VALUE'];
        }
        $boundOk = $stmt->fetch(PDO::FETCH_BOUND, PDO::FETCH_ORI_LAST); $boundLast = $bound;
        $stmt->closeCursor(); $stmt->execute(); $again = $stmt->fetchColumn();
        $empty = $pdo->query('SELECT 1 AS value WHERE 0');
        echo json_encode([$attributes, $metadata, $rows, $boundOk, $boundLast, $again, $empty->columnCount(), $empty->getColumnMeta(0)]);
        break;

    case 'batch':
        $pdo->exec('CREATE TABLE batch_features(id INTEGER PRIMARY KEY, name TEXT UNIQUE, amount INTEGER, payload BLOB)');
        $insert = $pdo->prepare('INSERT INTO batch_features(name, amount, payload) VALUES (:name, :amount, :payload)');
        $select = $pdo->prepare('SELECT name, amount, payload FROM batch_features WHERE name = :name');
        $name = 'alpha'; $amount = 7; $bytes = hex2bin('0080ff');
        $insert->bindParam('name', $name); $insert->bindParam('amount', $amount, PDO::PARAM_INT);
        $insert->bindValue('payload', $bytes, PDO::PARAM_LOB);
        $select->bindParam('name', $name);
        $firstOk = $pdo->cfd1Batch([$insert, $select]);
        $first = $select->fetch(PDO::FETCH_ASSOC); $first['payload'] = bin2hex($first['payload']);
        $count = $insert->rowCount(); $firstId = $pdo->lastInsertId();
        $name = 'beta'; $amount = '9';
        $secondOk = $pdo->cfd1Batch([$insert, $select]);
        $second = $select->fetch(PDO::FETCH_ASSOC); $second['payload'] = bin2hex($second['payload']);
        $insert->execute(['name' => 'ordinary', 'amount' => 11, 'payload' => null]);
        $select->execute(['name' => 'ordinary']); $ordinary = $select->fetch(PDO::FETCH_ASSOC);
        $select->execute(['name' => 'alpha']); $beforeBatch = $select->fetchColumn();
        $soloBatch = $pdo->cfd1Batch([$select]); $afterBatch = $select->fetchColumn();
        echo json_encode([$firstOk, $first, $count, $firstId, $secondOk, $second, $ordinary, $beforeBatch, $soloBatch, $afterBatch,
            $pdo->cfd1Batch([]), $pdo->inTransaction()]);
        break;

    case 'batch-errors':
        $pdo->exec('CREATE TABLE batch_failure_features(id INTEGER PRIMARY KEY, name TEXT)');
        $pdo->exec("INSERT INTO batch_failure_features(name) VALUES ('before')");
        $insert = $pdo->prepare('INSERT INTO batch_failure_features(name) VALUES (?)');
        $insert->bindValue(1, 'rolled-back');
        $bad = $pdo->prepare('SELECT * FROM batch_missing_table');
        $select = $pdo->prepare('SELECT name FROM batch_failure_features');
        $select->execute(); $select->fetchAll();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
        $failed = $pdo->cfd1Batch([$insert, $select, $bad]); $error = $pdo->errorInfo()[0];
        $state = [$insert->rowCount(), $select->fetch(), $bad->fetch(), $pdo->lastInsertId()];
        $required = $pdo->prepare('SELECT ? AS value');
        $missing = $pdo->cfd1Batch([$insert, $required]); $missingCode = $pdo->errorInfo()[0];
        $other = new PDO('cfd1:mainDb');
        $invalid = [$pdo->cfd1Batch([$insert, $insert]), $pdo->cfd1Batch([$other->prepare('SELECT 1')]),
            $pdo->cfd1Batch([new stdClass]), $pdo->cfd1Batch(['key' => $insert])];
        $rows = $pdo->query('SELECT name FROM batch_failure_features')->fetchAll(PDO::FETCH_COLUMN);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_WARNING);
        $warnings = []; set_error_handler(function($level, $message) use (&$warnings) { $warnings[] = strpos($message, 'HY093') !== false; return true; });
        $warned = $pdo->cfd1Batch([$required]); restore_error_handler();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        try { $pdo->cfd1Batch([$required]); $exception = false; }
        catch (PDOException $caught) { $exception = [$caught->getCode(), $caught->errorInfo[0]]; }
        $required->bindValue(1, 42, PDO::PARAM_INT); $recovered = $pdo->cfd1Batch([$required]);
        echo json_encode([$failed, $error, $state, $missing, $missingCode, $invalid, $rows, $warned, $warnings,
            $exception, $recovered, $required->fetchColumn()]);
        break;

    case 'batch-method':
        $method = new ReflectionMethod(PDO::class, 'cfd1Batch');
        $uninitialized = (new ReflectionClass(PDO::class))->newInstanceWithoutConstructor();
        try { $uninitialized->cfd1Batch([]); $guarded = false; }
        catch (PDOException $error) { $guarded = strpos($error->getMessage(), 'cfd1 PDO connection') !== false; }
        $invalid = (new ReflectionClass(PDOStatement::class))->newInstanceWithoutConstructor();
        try { $pdo->cfd1Batch([$invalid]); $invalidStatement = false; }
        catch (PDOException $error) { $invalidStatement = $error->errorInfo[0] === 'HY000'; }
        $pdo->setAttribute(PDO::ATTR_CASE, PDO::CASE_LOWER);
        $stmt = $pdo->prepare('SELECT 7 AS VALUE', [PDO::ATTR_CURSOR => PDO::CURSOR_SCROLL]);
        $stmt->bindColumn('value', $bound, PDO::PARAM_INT);
        $pdo->cfd1Batch([$stmt]); $metadata = $stmt->getColumnMeta(0);
        $fetched = $stmt->fetch(PDO::FETCH_BOUND, PDO::FETCH_ORI_LAST);
        echo json_encode([$method->isPublic(), $method->isDeprecated(), $guarded, $invalidStatement,
            $metadata['name'], $metadata['native_type'], $fetched, $bound]);
        break;

    case 'prepare-only':
        $stmt = $pdo->prepare('SELECT :value AS value'); $stmt->execute(['value' => 'before']);
        $before = $stmt->fetchColumn();
        try { $pdo->cfd1Batch([$stmt]); $error = null; } catch (PDOException $caught) { $error = $caught->errorInfo[0]; }
        $stmt->execute(['value' => 'after']);
        echo json_encode([$before, $error, $stmt->fetchColumn(), $pdo->cfd1Batch([])]);
        break;

    case 'errors':
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
        $errors = [];
        foreach (['SELECT :value, ?', 'SELECT ?0', 'SELECT ?101'] as $sql) {
            $errors[] = [$pdo->prepare($sql), $pdo->errorInfo()[0]];
        }
        $stmt = $pdo->prepare('SELECT :value AS value'); $stmt->execute(['value' => 'old']);
        $ok = $stmt->execute(['extra' => 'bad']); $errors[] = [$ok, $stmt->errorInfo()[0], $stmt->fetch()];
        $stmt->execute(['value' => 'recovered']); $recovered = $stmt->fetchColumn();
        $stmt->execute(['value' => 'cursor']); $backwards = $stmt->fetch(PDO::FETCH_ASSOC, PDO::FETCH_ORI_PRIOR);
        $cursorCode = $stmt->errorInfo()[0];
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $unsupported = [];
        foreach ([fn() => $pdo->getAttribute(PDO::ATTR_TIMEOUT),
            fn() => $pdo->prepare('SELECT 1', [PDO::ATTR_EMULATE_PREPARES => true]),
            fn() => new PDO('cfd1:mainDb', null, null, [PDO::ATTR_AUTOCOMMIT => false])] as $operation) {
            try { $operation(); $unsupported[] = false; } catch (PDOException $caught) { $unsupported[] = true; }
        }
        echo json_encode([$errors, $recovered, $backwards, $cursorCode, $unsupported]);
        break;

    default:
        throw new RuntimeException('Unknown D1 regression: ' . $feature);
}
