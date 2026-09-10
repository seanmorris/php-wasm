# Query Workbench

Expand **More...** on the demo home page and open **Query Workbench**, or visit `/php-wasm/query-workbench.html`. The workbench combines a connection and schema navigator, Ace SQL tabs, and editor/results/output panes with the demo's lightweight editor styling.

Choose **SQLite** and an existing database file in the demo's persisted filesystem, or **PostgreSQL** for the installed Drupal PGlite database. Click **Connect**, write or select a statement, and click **Run**. PostgreSQL uses the browser's PGlite database; it is not a remote PostgreSQL connection.

Queries use each engine's native SQL. Results show column names, rows, affected-row information, and errors. The schema navigator helps identify tables and columns. SQL files can be opened and saved in the demo filesystem. Opening a file, loading a URL, choosing a database, and connecting do not execute its SQL.

## Editing rows

Use a table's **Select rows** action in the schema navigator to open a structured table preview. A preview can edit individual supported cells when the worker verifies a primary or unique key for that row, including composite keys. Rows with NULL key values cannot be edited. Results from arbitrary SQL remain read-only.

Key columns and unsupported binary or generated cells remain read-only. Views and PostgreSQL inheritance parents are also read-only; a parent's own unique index does not establish uniqueness across its inherited rows. Partitioned PostgreSQL tables can use their complete enforced key.

Cell saves use parameters and the original key values, so quoted text and SQL-looking content remain values. The worker also checks the original cell value before updating. If another query has changed that cell or removed the row, the save reports a conflict instead of overwriting it; refresh the preview and review the current value before editing again. Each successful save changes exactly one row and is visible to the running CGI demo.

## Database identity and persistence

The workbench uses the same databases as the CGI demos. Writes change live demo data and remain after reloading. Database selection requires an existing database and never creates one implicitly.

| Demo | Engine | Database |
| --- | --- | --- |
| Drupal 11 | SQLite | `/persist/drupal-11.4.5/web/sites/default/files/.sqlite` |
| Drupal 11 | PostgreSQL/PGlite | `idb://host=drupal-11-pg18 dbname=postgres port=5432` |
| WordPress 7.1 | SQLite | `/persist/wordpress-7.1/wp-content/database/.ht.sqlite` |

SQLite paths refer to the worker's filesystem, not files on your computer. Embedded examples using a nonpersistent `people.db` run in a separate runtime and are not this CGI database.

## Execution limits

Each Run executes one statement, up to 64 KiB of SQL. Multi-statement batches and transaction controls are rejected. Connections belong to one operation, so transactions and session state do not carry across runs. SQLite PRAGMA/VACUUM/attached-database commands and PostgreSQL session commands/COPY are not supported. PostgreSQL and SQLite retain their own dialect and metadata differences.

Results have row and byte display limits. A truncated result is marked; these limits do not bound query execution time or memory. In particular, PostgreSQL may produce its result before the display limits are applied.

There is no Cancel command or automatic replay of writes. An interrupted connection does not establish whether a query completed; reconnect and inspect the database before deciding whether to run it again. Keep the selected target in view when changing tabs or engines.

## Browser regression checks

The workbench suite is `test/browser/query-workbench.spec.mjs`. It runs against the built demo artifact under `/php-wasm/`, using the existing Playwright configuration. It is included in the artifact runner, and skips unless `DEMO_WEB_ARTIFACT_ROOT` is set so that it cannot accidentally test the unrelated legacy browser server.

Run the artifact suite from the repository root after building the demo:

```sh
DEMO_WEB_ARTIFACT_ROOT=demo-web/build make test-demo-web
```

For just the workbench checks, start the artifact server in one terminal:

```sh
BROWSER_TEST_PORT=9414 DEMO_WEB_ARTIFACT_ROOT=demo-web/build node test/browser/demo-web-artifact-server.mjs
```

Then run Playwright in another:

```sh
BROWSER_TEST_PORT=9414 DEMO_WEB_ARTIFACT_ROOT=demo-web/build npx playwright test -c playwright.config.mjs test/browser/query-workbench.spec.mjs
```

Tests create disposable SQLite/PGlite fixtures in isolated browser contexts. They cover the Extras link and base path, mobile controls, explicit UI execution, URL non-execution, native engine errors, batch rejection without partial writes, duplicate and empty result columns, row truncation, missing-target behavior, concurrent CGI/PDO observation, and persistence after page reload and PHP runtime refresh. Table-preview checks cover primary/composite/unique keys, Unicode and quoted SQL-looking cell values, NULL and empty-string edits, rejected NULL/incomplete keys, and stale-edit conflicts observed through CGI/PDO. Existing artifact tests continue to cover the packaged Drupal and WordPress installation flows.
