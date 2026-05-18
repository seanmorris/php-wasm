---
title: FS Operations
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/filesystem/fs-operations.md
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

Get a list of files and folders in a directory.

```javascript
await php.readdir(path);
```

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

***Note:*** If you're using php-web in conjunction with php-cgi-worker to work on the filesystem, you'll need to `refresh` the filesystem in the worker. You can do that with the following call using `msg-bus` (as shown below).

```javascript
// Write a file
await sendMessage('writeFile', ['/path/to/your/file', 'contents', {encoding: 'utf8'}]);

// Check the path
const result = await sendMessage('analyzePath', ['/path/to/your/file']);
```

If you modify the filesystem outside of the service worker, you can refresh its filesystem with a call to `refresh`.

```javascript
// Tell the worker that the FS has been updated
await sendMessage('refresh');
```
