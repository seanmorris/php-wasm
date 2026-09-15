# pdo-cfd1

`pdo-cfd1` is the Cloudflare D1 PDO driver extension used by `php-wasm`.

This package exists mainly so custom `php-wasm` builds can vendor and compile the `pdo_cfd1` extension.
It does not ship a separate JavaScript entrypoint from this folder.
At runtime, support is enabled by passing Cloudflare D1 bindings into the PHP runtime.

The pinned upstream driver targets PHP 8.0–8.5 and includes the PHP 8.0 PDO
callback adapters. Its source is imported directly without a compatibility patch.

## Runtime Setup

Pass your Worker's D1 bindings into the `cfd1` object when you construct the runtime.
Each key becomes a PDO target name inside PHP.

```js
// The version-bound entry and its runtime/Wasm files come from the
// Cloudflare build profile. Keep those files together when bundling.
import { PhpCloudflare } from './php8.3-cloudflare.mjs';

export default {
  async fetch(request, env) {
    const php = new PhpCloudflare({
      cfd1: {
        mainDb: env.mainDb,
      },
    });

    await php.run(`<?php
      $pdo = new PDO('cfd1:mainDb');
      var_dump($pdo instanceof PDO);
    `);

    return new Response('ok');
  },
};
```

## Querying D1 Through PDO

Once the binding is present, use `cfd1:<bindingName>` as the DSN:

```js
await php.run(`<?php
  $pdo = new PDO('cfd1:mainDb');

  $select = $pdo->prepare(
    'SELECT PageTitle, PageContent FROM WikiPages WHERE PageTitle = ?'
  );

  $select->execute(['Home']);

  $page = $select->fetch(PDO::FETCH_ASSOC);
  var_dump($page);
`);
```

## Supported PDO operations

Ordinary execution accepts parameter arrays; explicit binding is optional:

```php
$stmt = $pdo->prepare('SELECT name FROM users WHERE id = ?');
$stmt->execute([$id]);

$stmt = $pdo->prepare('SELECT name FROM users WHERE id = :id');
$stmt->execute(['id' => $id]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
```

- Bare `?`, numbered `?NNN`, and PDO-style `:name` parameters are supported.
  Repeated names refer to one value. Named array keys may include the leading
  colon. Do not mix named and positional parameters in one statement.
- Numeric `bindValue()` / `bindParam()` positions start at 1; numeric
  `execute([...])` keys start at 0. Numbered placeholders preserve SQLite slot
  numbering, including unused gaps. Missing referenced slots, extra bindings,
  and indices outside D1's 1–100 range fail before execution.
- `execute([...])` uses PDO's normal default parameter type, `PDO::PARAM_STR`.
  Use explicit binding for `PARAM_INT`, `PARAM_BOOL`, `PARAM_NULL`, or `PARAM_LOB`.
  Bound references are read and converted again for each execution.
- `query()`, `exec()`, repeated execution, normal PDO fetch modes, and
  `closeCursor()` followed by re-execution are supported. `exec()` also accepts
  SQL scripts supported by D1 and returns D1's affected-row count.
- Write `rowCount()` comes from D1's `meta.changes`; it is not a SELECT row count.
- `quote()` escapes SQLite text literals. `quote($bytes, PDO::PARAM_LOB)` produces
  a hexadecimal BLOB literal. Quoted text containing NUL bytes fails explicitly;
  bound text can contain NUL bytes.
- `lastInsertId()` returns the last successful insert's D1 `meta.last_row_id` as
  a string, cached independently for each PDO connection. It starts at `"0"`.
  Reads, updates, other connections, and failed executions do not replace it.
  It is meaningful for inserts into rowid tables; named sequences are unsupported.
  If D1 omits an insert ID or reports one beyond JavaScript's safe integer range,
  the write still succeeds and `lastInsertId()` reports an error. An explicit
  `RETURNING CAST(id AS TEXT)` query can return a wide ID without number conversion.

### Binary values

Bind a PHP binary string or readable stream with `PDO::PARAM_LOB`. Streams are
read from their current position at execution; rewind them before reuse when
needed. Empty BLOBs and SQL NULL remain distinct. Results return BLOBs as binary
PHP strings without UTF-8 decoding.

### Cursors, metadata, and attributes

Results are buffered in the Worker. Forward-only cursors remain the default.
Pass `[PDO::ATTR_CURSOR => PDO::CURSOR_SCROLL]` to `prepare()` for NEXT, PRIOR,
FIRST, LAST, ABS, and REL fetch orientations. ABS offsets are zero-based; REL
offsets are relative to the current row. Moving outside the result returns
`false`; a later move can return to an existing row.

`getColumnMeta()` reports names and types observed in returned values, using the
current row or the first row before fetching. It does not invent table origins,
declared SQL types, or schema flags. Empty results have no column metadata through
D1's result interface. Use distinct column aliases: D1's object results do not
preserve duplicate column names.

PDO error modes, case conversion, default fetch modes, and bound columns retain
their normal behavior. Driver name, client version, cursor mode, autocommit, and
native-prepare attributes are available. Autocommit must remain enabled and
emulated prepares disabled. D1 does not expose its SQLite server version, so
`PDO::ATTR_SERVER_VERSION` fails explicitly.

## Atomic batches

Use existing prepared statements, with parameters bound before submission:

```php
$insert = $pdo->prepare('INSERT INTO users (name) VALUES (:name)');
$insert->bindValue('name', 'Alice');

$select = $pdo->prepare('SELECT name FROM users ORDER BY name');

$pdo->cfd1Batch([$insert, $select]);
$users = $select->fetchAll(PDO::FETCH_ASSOC);
$inserted = $insert->rowCount();
```

`cfd1Batch(array $statements): bool` submits one atomic D1 batch. Each entry must
be a distinct statement from that exact PDO connection. Bindings are snapshotted
when the batch starts; validation failures prevent any database request. An empty
list succeeds without a request. A binding exposing only `prepare()` still works
for ordinary queries; attempting a nonempty batch reports the missing capability.

On success each statement owns its results and affected-row count. A failed
execution clears attempted statements' earlier results and follows the connection's
PDO error mode. Database statement failures roll back the batch. Transport failures
are not retried automatically, because their commit outcome may be unknown.

Statements remain reusable with `execute([...])`, explicit bindings, or another
batch afterward. Do not call `execute()` just to supply batch parameters: it
executes the statement immediately, outside the later batch.

The extension registers `cfd1Batch()` as a real, driver-prefixed PDO method so the
same call works without deprecation warnings on PHP 8.0–8.5. Calling it on an
uninitialized PDO object or a different driver throws `PDOException`.

## Errors and remaining limits

D1 failures become PDO errors: exception mode throws `PDOException`, warning mode
emits a warning and returns `false`, and silent mode returns `false` with
`errorCode()` / `errorInfo()`. Missing or malformed D1 bindings fail construction.
Failed executions do not retain earlier rows or report placeholder success.

Batches are predetermined groups of statements, not transactions held open while
PHP reads intermediate results and decides what to execute next. PDO transaction
methods, persistent connections, output parameters, streaming cursors, multiple
result sets, `@name` / `$name` placeholders, and unsupported attributes remain
unavailable. Use the native D1 API separately for capabilities outside this driver.
D1's JavaScript API also limits numeric precision; binary data should use BLOB
bindings rather than text.

## Scope

- This is for `php-wasm` runtimes that execute in a Cloudflare Worker-compatible environment.
- Most consumers of the published `php-wasm` packages do not import anything from this package directly.
- If you are only using browser or Node runtimes, this extension is usually irrelevant.

## Custom Builds

Enable the extension in `.php-wasm-rc`:

```sh
WITH_PDO_CFD1=1
WITH_VRZNO=1
```

Build-related variables:

- `WITH_PDO_CFD1`: defaults to `0`. Set it to `1` to compile the extension into a custom build.
- `WITH_VRZNO`: must be `1`; the extension's build configuration declares a Vrzno dependency.
- `PDO_CFD1_REPOSITORY`: defaults to `https://github.com/seanmorris/pdo-cfd1.git`.
- `PDO_CFD1_REF`: defaults to immutable commit `699c2e6cd334ca0906458d05c6296420c1a153f8`.
- `PDO_CFD1_DEV_PATH`: optional external checkout, read without modifying it.

The importer records the resolved commit (or development path) and each source
file's SHA-256 in `.php-wasm-source.json`. The PHP configure/build dependencies
use that manifest. Unchanged imports preserve modification times; changed or
missing inputs are repaired before the next build. Restored manifests from the
previous patched driver are migrated to the directly imported source.

JavaScript bodies (`pdo_cfd1_*.js`), the `pdo_cfd1_js.h.in` template, and
`Makefile.frag` are included in that source inventory. The driver's normal PHP
Make build uses Emscripten's directives-only preprocessor to expand the template's
JS includes into an `EM_JS`/`EM_ASYNC_JS` header, preserving JS identifiers and
comments. The compiler records nested include dependencies for incremental
rebuilds. Generated headers and dependency files stay in the build directory and
are not imported; the JavaScript remains embedded in the compiled driver object.

Custom refs and development checkouts supply the driver source as-is. Choose a
revision compatible with the target PHP version. Driver unit tests are maintained
in the upstream PDO-CFD1 repository; php-wasm keeps importer, packaging, and real
PHP/Asyncify/D1 integration coverage.
