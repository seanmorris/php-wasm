<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/filesystem/transactions.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/webTransactions.mjs
-->
# Transactions

**Note: This feature is available for Web and Worker environments only!**

The web and worker builds utilize `navigator.locks.request` to request a lock named `php-wasm-fs-lock` before performing filesystem operations. This ensures that multiple tabs and the service worker can interact with the filesystem without overwriting each other's work.

Before any filesystem operation occurs, the entire filesystem is loaded from IDBFS, and before releasing the lock, the entire filesystem is loaded back into IDBFS.

The operations are enqueued asynchronously, meaning that **if multiple requests are generated before one transaction closes, they will be automatically batched.** This also applies to multiple requests generated before the lock is acquired. Generally, there is no need to take explicit control of filesystem mirroring.

## Manual Control of FS Mirroring

If you prefer to suppress this automatic behavior and take explicit control over filesystem mirroring, you can pass the `{autoTransaction: false}` option to the constructor. In this case, you will need to call `php.startTransaction()` before any filesystem operations, and then `php.commitTransaction()` when you are done. **Using this incorrectly may leave your filesystem in a corrupted state.**

### php.startTransaction

```javascript
await php.startTransaction();
```

### php.commitTransaction

```javascript
await php.commitTransaction();
```
