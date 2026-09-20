---
title: Transactions
---
<!--
Vendored from the php-wasm-site working tree based on commit bdf1555ad207242ac09292ff05b125f006a9d049
Local update: bounded browser CGI batching, incremental IDBFS commits and durable acknowledgments.
Source: https://github.com/seanmorris/php-wasm-site/blob/bdf1555ad207242ac09292ff05b125f006a9d049/pages/filesystem/transactions.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/webTransactions.mjs
-->
# Transactions

**Note: This feature is available for Web and Worker environments only!**

With persistence enabled, browser runtimes synchronize their mounted IDBFS
storage while holding the `php-wasm-fs-lock` Web Lock.

## Browser CGI

Queued filesystem calls share a transaction. After the queue becomes idle,
the wrapper waits up to 25 ms for more work. Storage is refreshed once per
batch. A batch containing only `analyzePath`, `readdir`, `readFile`, or `stat`
does not flush; any mutation makes the batch writable. Every call waits for
the shared commit before its promise resolves or the service worker replies.
A commit failure rejects every call in the batch. A callback failure still
allows possible partial writes to be committed and later calls to run.
The wait keeps the wrapper transaction open, not an IndexedDB transaction.
IDBFS opens its own database transactions while hydrating or flushing.

Calls submitted together, including through `Promise.all`, can share a batch.
Sequentially awaited calls create separate batches. Batches commit after 64
operations or a 250 ms processing window, checked between operations, so
sustained traffic cannot defer acknowledgments indefinitely. A single slow
callback is not interrupted. HTTP CGI requests use a separate path and still
flush after each successful PHP request.

For a directory's names and types, request `readdir(path, {withFileTypes: true})`:
all metadata is read in one operation. File Bus uses this option for VS Code
directory expansion and recursive file search when the host supports it.

Browser CGI tracks PHP and filesystem API mutations and commits only changed
IDBFS records. This includes file contents, metadata, renamed directory trees
and deletions. A clean mount needs no write transaction. The database format
stays compatible with existing storage and older IDBFS readers. Hydration still
reconciles remote changes and uses a direct local-node walk; nested mounts use
ordinary reconciliation. Failed commits keep their pending changes and retry
them before a later hydration can replace local state. Symlinks restore their
own metadata without following or changing their targets.

## Embedded browser runtimes

`PhpWeb` and `PhpWorker` retain their batched queues. Their operation results can
become available before the shared transaction commits. The per-call persistence
acknowledgment described above applies to browser CGI filesystem methods.

## Manual Control of FS Mirroring

With `{autoTransaction: false}`, the caller owns transaction boundaries and
serialization across runtimes. `startTransaction()` loads persisted storage;
`commitTransaction()` flushes changes. These methods do not hold a Web Lock
across a sequence of public calls. Do not acquire `php-wasm-fs-lock` and then
await a public queued method that needs the same lock. Prefer automatic
transactions unless you provide coordination for the complete operation.

### php.startTransaction

```javascript
await php.startTransaction();
```

### php.commitTransaction

```javascript
await php.commitTransaction();
```

For a manually managed transaction that performed only reads, use
`await php.commitTransaction(true)` to close it without flushing. Never pass
`true` after a mutation that must be persisted.
