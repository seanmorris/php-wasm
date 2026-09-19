---
title: FS Operations
---
<!--
Vendored from php-wasm-site commit bdf1555ad207242ac09292ff05b125f006a9d049
Source: https://github.com/seanmorris/php-wasm-site/blob/bdf1555ad207242ac09292ff05b125f006a9d049/pages/filesystem/fs-operations.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpNode.mjs
-->
# Filesystem Operations

## Filesystem Methods

The following EmscriptenFS methods are exposed via the php object:

### php.analyzePath

Get information about a file or directory.

```javascript
await php.analyzePath(path);
```

### php.readdir

Get entry names as `string[]`:

```javascript
await php.readdir(path);
```

Pass `{withFileTypes: true}` to return serializable entry types:

```javascript
const entries = await php.readdir(path, {withFileTypes: true});
// Each entry is {name: string, isFolder: boolean}.
```

Both forms preserve filesystem order and include `.` and `..`. Types follow
symbolic links, as `analyzePath` does. Listing and metadata errors, including
dangling links, reject the operation. Omitted options or `withFileTypes: false`
keep the name-only result. Embedded, CLI, CGI, debugger, and Cloudflare wrappers
support this option, with matching TypeScript overloads.

Browser CGI resolves the whole typed listing inside one read-only transaction,
with one storage refresh and no flush. This avoids a separate `analyzePath`
request for every entry. See [Transactions](/filesystem/transactions.html).

### php.readFile

Get the contents of a file as a `Uint8Array` by default, or optionally as utf-8.

```javascript
await php.readFile(path);
```

```javascript
await php.readFile(path, {encoding: 'utf8'});
```

### php.stat

Get information about a file or directory.

```javascript
await php.stat(path);
```

### php.mkdir

Create a directory.

```javascript
await php.mkdir(path);
```

### php.rmdir

Delete a directory (must be empty).

```javascript
await php.rmdir(path);
```

### php.unlink

Delete a file.

```javascript
await php.unlink(path);
```

### php.rename

Rename a file or directory.

```javascript
await php.rename(path, newPath);
```

### php.writeFile

Create a new file. Content should be supplied as a `Uint8Array`, or optionally as a string of text.

```javascript
await php.writeFile(path, data);
```

```javascript
await php.writeFile(path, data, {encoding: 'utf8'});
```

## Accessing the FileSystem of a Service Worker

Use the `quickbus` client from the
[Service Worker guide](/getting-started/cgi-service-worker.html#quickbus).
Browser CGI filesystem methods refresh persisted storage automatically with
`autoTransaction` enabled. Await the writer's persistence before reading from
another runtime.

```javascript
// Write a file
await bus.writeFile('/path/to/your/file', 'contents', {encoding: 'utf8'});

// Check the path
const result = await bus.analyzePath('/path/to/your/file');

// Get names and types in one request.
const entries = await bus.readdir('/path/to/your', {withFileTypes: true});
```

`refresh()` recreates the PHP runtime, discarding temporary files and in-memory
PHP state. Use it when you need a fresh runtime, rather than before each read.

```javascript
// Recreate the runtime; only persisted files survive.
await bus.refresh();
```
