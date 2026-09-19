---
title: Transactions
---
<!--
Vendored from php-wasm-site commit bdf1555ad207242ac09292ff05b125f006a9d049
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

Each queued filesystem call gets its own transaction. Storage is refreshed
before the operation. `analyzePath`, `readdir`, `readFile`, and `stat` are
read-only and do not flush afterward. Mutations wait for persistence before
their promises resolve or the service worker sends its reply. A persistence
failure rejects the call, and subsequent operations can still run.

Concurrent calls remain separate transactions, including calls started with
`Promise.all`. For a directory's names and types, request
`readdir(path, {withFileTypes: true})`: all metadata is read inside that one
transaction, with one refresh and no flush. File Bus uses this option for VS Code
directory expansion and recursive file search when the host supports it.

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
