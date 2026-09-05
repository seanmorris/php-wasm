import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../test/lib/PhpNode.mjs';
import { PGlite } from '@electric-sql/pglite';

const createPhp = () => new PhpNode({
	PGlite,
	ini: 'display_errors=Off\nlog_errors=On\nerror_log=/dev/stderr\nhtml_errors=Off\nerror_reporting=E_ALL\n',
});

const captureOutput = php => {
	let stdout = '';
	let stderr = '';

	php.addEventListener('output', event => event.detail.forEach(part => void (stdout += part)));
	php.addEventListener('error', event => event.detail.forEach(part => void (stderr += part)));

	return {
		stdout: () => stdout
		, stderr: () => stderr
	};
};

test('PDO PGlite supports Drupal PostgreSQL connection attributes', {timeout: 30_000}, async () => {
	const php = createPhp();
	const output = captureOutput(php);

	await php.binary;

	const exitCode = await php.run(String.raw`<?php
		$pdo = new PDO(
			'pgsql:',
			'drupal',
			NULL,
			[
				PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
				PDO::ATTR_EMULATE_PREPARES => TRUE,
				PDO::ATTR_STRINGIFY_FETCHES => TRUE,
			]
		);

		$statement = $pdo->prepare('SELECT CAST(:value AS TEXT) AS value');
		$statement->execute(['value' => 'drupal']);

		$result = [
			'emulate_prepares' => $pdo->getAttribute(PDO::ATTR_EMULATE_PREPARES),
			'stringify_fetches' => $pdo->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
			'server_version' => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION),
			'client_version' => $pdo->getAttribute(PDO::ATTR_CLIENT_VERSION),
			'prepared_value' => $statement->fetchColumn(),
		];

		$result['set_native_prepares'] = $pdo->setAttribute(
			PDO::ATTR_EMULATE_PREPARES,
			FALSE
		);
		$result['emulate_prepares_after_set'] = $pdo->getAttribute(
			PDO::ATTR_EMULATE_PREPARES
		);

		echo json_encode($result, JSON_THROW_ON_ERROR);
	`);

	assert.equal(exitCode, 0, output.stderr());
	assert.equal(output.stderr(), '');

	const result = JSON.parse(output.stdout());

	assert.deepEqual(result, {
		emulate_prepares: true
		, stringify_fetches: true
		, server_version: result.server_version
		, client_version: result.client_version
		, prepared_value: 'drupal'
		, set_native_prepares: true
		, emulate_prepares_after_set: false
	});
	assert.match(result.server_version, /^\d+(?:\.\d+)+/);
	assert.equal(result.client_version, result.server_version);
});

test('PDO PGlite STRINGIFY_FETCHES tracks connection state and fetched types', {timeout: 30_000}, async () => {
	const php = createPhp();
	const output = captureOutput(php);

	await php.binary;

	const exitCode = await php.run(String.raw`<?php
		$options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
		$pdo = new PDO('pgsql:', NULL, NULL, $options);
		$stringified = new PDO('pgsql:', NULL, NULL, $options + [
			PDO::ATTR_STRINGIFY_FETCHES => TRUE,
		]);
		$native = new PDO('pgsql:', NULL, NULL, $options + [
			PDO::ATTR_STRINGIFY_FETCHES => FALSE,
		]);
		$sql = <<<'SQL'
			SELECT 42::integer, 1.5::double precision, TRUE, FALSE, NULL::integer, '007'::text
		SQL;
		$fetch = static fn (PDO $connection): array => $connection
			->query($sql)->fetch(PDO::FETCH_NUM);

		$result = [
			'initial_attributes' => [
				$pdo->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
				$stringified->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
				$native->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
			],
			'initial_rows' => [$fetch($pdo), $fetch($stringified), $fetch($native)],
			'changes' => [],
		];

		foreach([TRUE, FALSE, TRUE, FALSE] as $enabled)
		{
			$result['changes'][] = [
				'set' => $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, $enabled),
				'attribute' => $pdo->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
				'row' => $fetch($pdo),
				'other_attributes' => [
					$stringified->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
					$native->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
				],
			];
		}
		$result['other_rows'] = [$fetch($stringified), $fetch($native)];

		// Fetching an already-executed statement observes the current PDO state.
		foreach([TRUE, FALSE] as $enabled)
		{
			$statement = $pdo->query($sql);
			$result['deferred_fetch'][] = [
				'set' => $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, $enabled),
				'attribute' => $pdo->getAttribute(PDO::ATTR_STRINGIFY_FETCHES),
				'row' => $statement->fetch(PDO::FETCH_NUM),
			];
		}

		echo json_encode($result, JSON_THROW_ON_ERROR);
	`);

	assert.equal(exitCode, 0, output.stderr());
	assert.equal(output.stderr(), '');

	const native = [42, 1.5, true, false, null, '007'];
	const stringified = ['42', '1.5', '1', '0', null, '007'];

	assert.deepEqual(JSON.parse(output.stdout()), {
		initial_attributes: [false, true, false]
		, initial_rows: [native, stringified, native]
		, changes: [true, false, true, false].map(enabled => ({
			set: true
			, attribute: enabled
			, row: enabled ? stringified : native
			, other_attributes: [true, false]
		}))
		, other_rows: [stringified, native]
		, deferred_fetch: [true, false].map(enabled => ({
			set: true
			, attribute: enabled
			, row: enabled ? stringified : native
		}))
	});
});

test('PDO PGlite supports PDO queries, values, and transactions', {timeout: 30_000}, async () => {
	const php = createPhp();
	const output = captureOutput(php);

	await php.binary;

	const exitCode = await php.run(String.raw`<?php
		$pdo = new PDO('pgsql:');
		$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		$binary = "\x00\xff\x80PDO\x00";
		$textWithBackslash = "slash\\'quote";
		$injectionPayload = "x\\'); INSERT INTO quote_injection VALUES (42); --";

		$pdo->exec('SET standard_conforming_strings = off');
		$pdo->exec('CREATE TABLE quote_injection (value INTEGER)');
		$quotedText = $pdo->quote($textWithBackslash);
		$quotedLob = $pdo->quote($binary, PDO::PARAM_LOB);
		$quotedInjection = $pdo->quote($injectionPayload);

		$result = [
			'extension' => extension_loaded('pdo_pglite'),
			'driver' => $pdo->getAttribute(PDO::ATTR_DRIVER_NAME),
			'quote' => $pdo->quote("O'Reilly"),
			'escaped_quote' => $quotedText,
			'escaped_quote_value' => $pdo->query("SELECT {$quotedText}::text")->fetchColumn(),
			'lob_quote' => $quotedLob,
			'lob_quote_hex' => bin2hex(
				$pdo->query("SELECT {$quotedLob}::bytea")->fetchColumn()
			),
			'injection_quote_value' => $pdo
				->query("SELECT {$quotedInjection}::text")
				->fetchColumn(),
			'injected_rows' => (int) $pdo
				->query('SELECT COUNT(*) FROM quote_injection')
				->fetchColumn(),
		];

		$pdo->exec('SET standard_conforming_strings = on');

		$result['create_row_count'] = $pdo->exec(
			'CREATE TABLE records ('
			. 'id BIGSERIAL PRIMARY KEY, '
			. 'label TEXT NOT NULL'
			. ')'
		);

		$insert = $pdo->prepare('INSERT INTO records (label) VALUES (:label)');
		$result['insert_row_counts'] = [];

		foreach(['first', 'second'] as $label)
		{
			$insert->execute(['label' => $label]);
			$result['insert_row_counts'][] = $insert->rowCount();
		}

		$result['multi_statement_row_count'] = $pdo->exec(
			"INSERT INTO records (label) VALUES ('third'); "
			. "INSERT INTO records (label) VALUES ('fourth')"
		);
		$result['select_exec_row_count'] = $pdo->exec('SELECT label FROM records');

		$result['last_insert_id'] = $pdo->lastInsertId();
		$result['named_last_insert_id'] = $pdo->lastInsertId('records_id_seq');

		try
		{
			$pdo->lastInsertId('');
			$result['empty_sequence_name'] = null;
		}
		catch(PDOException $exception)
		{
			$result['empty_sequence_name'] = $exception->getCode();
		}

		$records = $pdo->prepare('SELECT id, label FROM records ORDER BY id');
		$records->execute();
		$result['record_shape'] = [
			'rows' => $records->rowCount(),
			'columns' => $records->columnCount(),
		];

		$empty = $pdo->prepare('SELECT id, label FROM records WHERE FALSE');
		$empty->execute();
		$result['empty_shape'] = [
			'rows' => $empty->rowCount(),
			'columns' => $empty->columnCount(),
			'fetch' => $empty->fetch(PDO::FETCH_NUM),
		];

		$duplicates = $pdo->query(
			"SELECT 'left'::text AS duplicate, 'right'::text AS duplicate"
		);
		$result['duplicate_columns'] = [
			'columns' => $duplicates->columnCount(),
			'row' => $duplicates->fetch(PDO::FETCH_NUM),
		];

		$positional = $pdo->prepare(
			'SELECT CAST(? AS TEXT) AS text_value, CAST(? AS INTEGER) AS int_value'
		);
		$positional->execute(['positional', 7]);
		$result['positional_params'] = $positional->fetch(PDO::FETCH_NUM);

		$reused = $pdo->prepare('SELECT CAST(:value AS TEXT) AS value');
		$reused->execute(['value' => 'one']);
		$result['reused_params'] = [$reused->fetchColumn()];
		$reused->execute(['value' => 'two']);
		$result['reused_params'][] = $reused->fetchColumn();

		try
		{
			$reused->execute([]);
			$result['missing_parameter'] = [
				'caught' => false,
				'sqlstate' => null,
				'value' => $reused->fetchColumn(),
			];
		}
		catch(PDOException $exception)
		{
			$result['missing_parameter'] = [
				'caught' => true,
				'sqlstate' => $exception->getCode(),
			];
		}

		$reused->execute(['value' => 'three']);
		$result['reused_params'][] = $reused->fetchColumn();

		$typed = $pdo->query(<<<'SQL'
			SELECT
				9223372036854775807::bigint AS int8_value,
				DATE '2024-01-02' AS date_value,
				TIMESTAMP '2024-01-02 03:04:05' AS timestamp_value,
				'{"key":"value"}'::json AS json_value,
				'{1,2,3}'::int[] AS array_value
		SQL);
		$result['typed_values'] = $typed->fetch(PDO::FETCH_NUM);

		$pdo->exec('CREATE TABLE blobs (payload BYTEA NOT NULL)');
		$stream = fopen('php://memory', 'r+');
		fwrite($stream, $binary);
		rewind($stream);
		$blobInsert = $pdo->prepare('INSERT INTO blobs (payload) VALUES (:payload)');
		$blobInsert->bindParam(':payload', $stream, PDO::PARAM_LOB);
		$blobInsert->execute();
		$blob = $pdo->query('SELECT payload FROM blobs')->fetchColumn();
		$result['binary_lob'] = [
			'insert_rows' => $blobInsert->rowCount(),
			'hex' => bin2hex($blob),
		];

		$boundId = null;
		$boundLabel = null;
		$bound = $pdo->prepare('SELECT id, label FROM records ORDER BY id LIMIT 1');
		$bound->execute();
		$bound->bindColumn(1, $boundId, PDO::PARAM_STR);
		$bound->bindColumn('label', $boundLabel, PDO::PARAM_STR);
		$result['bound_columns'] = [
			'fetched' => $bound->fetch(PDO::FETCH_BOUND),
			'id' => $boundId,
			'label' => $boundLabel,
		];

		$pdo->exec('CREATE TABLE transaction_log (label TEXT NOT NULL)');
		$result['transactions'] = [];

		$pdo->beginTransaction();
		$result['transactions']['during_rollback'] = $pdo->inTransaction();
		$pdo->exec("INSERT INTO transaction_log VALUES ('rolled back')");
		$pdo->rollBack();
		$result['transactions']['after_rollback'] = $pdo->inTransaction();
		$result['transactions']['rows_after_rollback'] = (int) $pdo
			->query('SELECT COUNT(*) FROM transaction_log')
			->fetchColumn();

		$pdo->beginTransaction();
		$result['transactions']['during_commit'] = $pdo->inTransaction();
		$pdo->exec("INSERT INTO transaction_log VALUES ('committed')");
		$pdo->commit();
		$result['transactions']['after_commit'] = $pdo->inTransaction();
		$result['transactions']['rows_after_commit'] = (int) $pdo
			->query('SELECT COUNT(*) FROM transaction_log')
			->fetchColumn();

		try
		{
			$pdo->query('SELECT * FROM pdo_pglite_missing_table');
			$result['query_error'] = null;
		}
		catch(PDOException $exception)
		{
			$result['query_error'] = [
				'exception_code' => $exception->getCode(),
				'error_info_state' => $exception->errorInfo[0] ?? null,
			];
		}

		echo json_encode($result, JSON_THROW_ON_ERROR);
	`);

	assert.equal(exitCode, 0, output.stderr());
	assert.equal(output.stderr(), '');

	const result = JSON.parse(output.stdout());
	const missingParameter = result.missing_parameter;

	delete result.missing_parameter;

	assert.deepEqual(result, {
		extension: true
		, driver: 'pgsql'
		, quote: "'O''Reilly'"
		, escaped_quote: "E'slash\\\\''quote'"
		, escaped_quote_value: "slash\\'quote"
		, lob_quote: "E'\\\\x00ff8050444f00'"
		, lob_quote_hex: '00ff8050444f00'
		, injection_quote_value: "x\\'); INSERT INTO quote_injection VALUES (42); --"
		, injected_rows: 0
		, create_row_count: 0
		, insert_row_counts: [1, 1]
		, last_insert_id: '4'
		, named_last_insert_id: '4'
		, empty_sequence_name: '42602'
		, multi_statement_row_count: 2
		, select_exec_row_count: 0
		, record_shape: {rows: 4, columns: 2}
		, empty_shape: {rows: 0, columns: 2, fetch: false}
		, duplicate_columns: {columns: 2, row: ['left', 'right']}
		, positional_params: ['positional', 7]
		, reused_params: ['one', 'two', 'three']
		, typed_values: [
			'9223372036854775807'
			, '2024-01-02'
			, '2024-01-02 03:04:05'
			, '{"key":"value"}'
			, '{1,2,3}'
		]
		, binary_lob: {insert_rows: 1, hex: '00ff8050444f00'}
		, bound_columns: {fetched: true, id: '1', label: 'first'}
		, transactions: {
			during_rollback: true
			, after_rollback: false
			, rows_after_rollback: 0
			, during_commit: true
			, after_commit: false
			, rows_after_commit: 1
		}
		, query_error: {
			exception_code: '42P01'
			, error_info_state: '42P01'
		}
	});
	assert.equal(missingParameter.caught, true);
	assert.match(missingParameter.sqlstate, /^(08P01|HY093)$/);
});
