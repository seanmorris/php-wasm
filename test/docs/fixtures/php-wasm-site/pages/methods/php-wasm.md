---
pagetitle: Php-Wasm Methods
weight: -1000
itemtype: schema.org/Class
microdata:
    name: PhpWasm
    alternateName: PhpNode
    alternateName: PhpWeb
---
<!--
Vendored from php-wasm-site working tree based on commit 842858b6c6158724c05beace20929ba35793ff57
Source: https://github.com/seanmorris/php-wasm-site/blob/842858b6c6158724c05beace20929ba35793ff57/pages/methods/php-wasm.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpNode.mjs
-->
# Php-Wasm Methods

## constructor

The concrete `php-wasm` classes all extend the same base runtime API:

- `PhpWeb`
- `PhpNode`

Both accept the same core options bucket, with different defaults for binary loading and filesystem persistence depending on environment.

### Common constructor options

### version

*string*

Selects the PHP runtime version to load. The current defaults in `source/` are `8.4` for `PhpWeb` and `PhpNode`.

```javascript
const php = new PhpWeb({version: '8.4'});
```

### variant

*string*

Optional build suffix appended to the runtime filename.

```javascript
const php = new PhpWeb({version: '8.4', variant: '-debug'});
```

### sharedLibs

*array of strings or objects*

Loads shared extensions before boot and writes `extension=...` lines for any item with `ini: true`.

```javascript
const php = new PhpWeb({
  sharedLibs: [
    { url: 'https://unpkg.com/php-wasm-sqlite/php8.4-sqlite.so', ini: true },
    { url: 'https://unpkg.com/php-wasm-sqlite/sqlite.so', ini: false },
  ]
});
```

ESM helper packages can be passed directly here. CommonJS callers should pass strings, `URL`s, or `{name, url, ini}` records manually instead.

### dynamicLibs

*array of strings or objects*

Resolved the same way as `sharedLibs`, but never written into `php.ini`.

The same CommonJS rule applies here: pass manual strings, `URL`s, or objects rather than the ESM helper packages.

### files

*array of objects*

Preloads arbitrary files into the runtime before startup.

Dynamic and shared `intl` builds use this mechanism to provide `icudt72l.dat` under `/preload`. Static `intl` builds can bundle the same file into the runtime `.data` package instead.

```javascript
const php = new PhpWeb({
  files: [
    {
      name: 'icudt72l.dat',
      parent: '/preload/',
      url: 'https://unpkg.com/php-wasm-intl/icudt72l.dat'
    }
  ]
});
```

### locateFile

*function(path, directory): string | URL | undefined*

Overrides how `.wasm`, shared libraries, preload assets, and other runtime files are resolved.

### ini

*string*

Additional `php.ini` lines appended to the generated runtime config.

```javascript
const php = new PhpWeb({ini: `
display_errors=1
memory_limit=256M
`});
```

### persist

*object or array*

Mounts persistent filesystems. In web runtimes this is typically IDBFS, and in `PhpNode` it can point to a host directory.

### autoTransaction

*boolean*

Defaults to `true`. Controls whether queued operations automatically start and commit filesystem transactions.

### shared

*object*

Shared JS object registry used internally by `php.x` and `php.r` when VRZNO is enabled. You generally do not need to set this manually.

## php.run

Run a PHP script and return its numeric exit code. `php.run()` is the right choice when you want script semantics, output on STDOUT/STDERR, or mixed PHP/HTML.

The examples in this project use an opening `<?php` tag, and that remains the safest form to document and copy.

You'll need to use [event listeners](/getting-started/php-in-js.html#running-php-taking-output) to capture output.

```javascript
const exitCode = await php.run(`<?php
    $time = strtotime('8:00pm 2 days ago');
    $date = date('Y-m-d H:i:s', $time);
    echo $date;`
);
```

## php.exec

Execute a single PHP expression and return the result as a string.

Unlike `php.run()`, this should:

- not start with `<?php`
- not end in a semicolon
- evaluate to one expression

Multiple steps can be wrapped in an IIFE.

If you want automatic JS marshalling for functions, arrays, objects, or other VRZNO-backed values, use `php.x` instead.

To run multiple commands in a single statement, use an [IIFE](https://en.wikipedia.org/wiki/Immediately_invoked_function_expression).

```javascript
const date = await php.exec(`(function() {
    $time = strtotime('8:00pm 2 days ago');
    $date = date('Y-m-d H:i:s', $time);
    return $date;
})();`);
```

## php.r

Tagged template function companion to `php.run()`. If Vrzno is enabled, allows rich JS values to be interpolated into PHP code.

Just like `php.run()`, this will return a non-zero value in case of error.

```javascript
const exitCode = await php.r`<?php
    $time = strtotime('8:00pm 2 days ago');
    $date = date('Y-m-d H:i:s', $time);
    echo $date;`;
```

## php.x

Tagged template function companion to `php.exec()`. If Vrzno is enabled, allows rich JS values to be interpolated into PHP code.

Like `php.exec()`, this may only evaluate a single expression at a time. Unlike `php.exec()`, it will marshal the result back into Javascript when VRZNO support is available.

```javascript
const callback = await php.x`function() {
    return 321;
}`;

const value = callback();
```

## php.refresh

Refreshes the PHP runtime and clears in-memory state. Any JS handles backed by live PHP values become invalid after a refresh.

```javascript
await php.refresh();
```

## Input and Filesystem Helpers

All `PhpBase` implementations also expose the queued helper methods below:

- `php.inputString(string)`
- `php.input(bytes)`
- `php.analyzePath(path)`
- `php.readdir(path)`
- `php.readFile(path, options)`
- `php.stat(path)`
- `php.mkdir(path)`
- `php.rmdir(path)`
- `php.rename(path, newPath)`
- `php.writeFile(path, data, options)`
- `php.unlink(path)`

These methods run through the same queueing and transaction logic as `run`, `exec`, `r`, and `x`.
