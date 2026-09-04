---
title: Vrzno
---
<!--
Vendored from php-wasm-site commit 3ba91aac4946c53c89d0fdfa6ea10eadd8d27684
Source: https://github.com/seanmorris/php-wasm-site/blob/3ba91aac4946c53c89d0fdfa6ea10eadd8d27684/pages/extensions/vrzno.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.mjs
-->
# Vrzno

Vrzno is the JavaScript bridge extension for `php-wasm`. It lets PHP work with
JavaScript values, objects, arrays, callbacks, classes, promises, and globals as
if they were local PHP values.

Vrzno 0.2 requires PHP 8.0 or newer compiled for Emscripten's wasm32 memory
model. It supports PHP 8.0 through 8.5 in browser, Node.js, and Cloudflare
Worker runtimes; it is not a native desktop or server PHP extension.

The PDO connectors that originally lived in Vrzno are separate extensions:

- [Cloudflare D1](/extensions/pdo-cfd1.html)
- [PGlite/PostgreSQL](/extensions/pdo-pglite.html)

## Quick Start

In `php-wasm`, Vrzno is normally available by default. Pass JavaScript values
to the runtime constructor and retrieve them from PHP with `vrzno_env()`.

```javascript
import { PhpNode } from 'php-wasm/PhpNode.mjs';

const php = new PhpNode({
    version: '8.4',
    answer: 42,
});

await php.run(`<?php
    $window = new Vrzno;

    var_dump(vrzno_env('answer'));
    var_dump($window->Date->now() > 0);
`);
```

## Core API

### `new Vrzno`

Creates a handle to JavaScript's `globalThis`. In a browser, that normally
means `window`.

```php
<?php
$window = new Vrzno;
```

### `vrzno_await($promiseLike)`

Waits for a promise-like JavaScript value to settle and returns its resolved
value to PHP.

```php
<?php
$window = new Vrzno;
$response = vrzno_await(
    $window->fetch('https://api.weather.gov/gridpoints/TOP/40,74/forecast')
);
$json = vrzno_await($response->json());

var_dump($json);
```

### `vrzno_import($moduleUrl)`

Performs a dynamic JavaScript `import()` and returns the resulting promise or
module bridge.

```php
<?php
$plot = vrzno_await(
    vrzno_import('https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm')
);
```

### `vrzno_env($name)`

Returns a value attached directly to the runtime constructor options.

```javascript
const php = new PhpNode({gi, Gtk, WebKit2});
```

```php
<?php
$gi = vrzno_env('gi');
$Gtk = vrzno_env('Gtk');
$WebKit2 = vrzno_env('WebKit2');
```

### `vrzno_shared($name)`

Reads a value from the runtime's shared-value map. Helpers such as `php.x` and
`php.r` use this registry to move arbitrary JavaScript values into PHP without
JSON encoding them first.

### `vrzno_target($value)`

Returns the internal numeric target handle for a bridged JavaScript object.
This is primarily useful for debugging bridge internals.

### Compatibility Helpers

The string-based legacy helpers remain available, although the object bridge
is preferred:

- `vrzno_eval($code)`
- `vrzno_run($globalFunctionName, $args = [])`
- `vrzno_timeout($milliseconds, $callback)`

## Objects, Classes, and Callbacks

JavaScript classes and objects cross the bridge directly. Static calls,
constructors, property reads, and method calls use normal PHP syntax.

```php
<?php
$window = new Vrzno;
$Date = $window->Date;

var_dump($Date->now());

$date = new $Date;
var_dump($date->toISOString());
```

PHP callables can also be passed to JavaScript:

```php
<?php
$window = new Vrzno;
$window->setTimeout(
    fn() => $window->console->log('Done from PHP'),
    1000
);
```

JavaScript arrays are exposed as array-like iterable values, with indexed and
property-style access on the PHP side.

## Value and Error Semantics

- JavaScript `null` and `undefined` both become PHP `null`; PHP has no distinct
  undefined value.
- PHP `null` becomes JavaScript `null`. A missing PHP array key or object
  property reads as JavaScript `undefined`.
- `property_exists()` distinguishes an existing JavaScript property containing
  `null` or `undefined` from a missing property. `isset()` is false for all
  three cases.
- JavaScript 32-bit integers become PHP integers. Other numbers, including
  `NaN`, infinities, and larger integers, become PHP floats.
- JavaScript BigInt and Symbol values cannot be represented in PHP and throw a
  `TypeError`.
- Embedded null bytes are preserved in strings crossing either direction.
- JavaScript exceptions and rejected promises become catchable PHP
  `RuntimeException` instances.
- A JavaScript proxy that outlives a PHP runtime refresh throws `ReferenceError`
  when used.

`Vrzno` instances are live runtime handles, not value objects. They cannot be
cloned or serialized. Extract the plain data you need first, for example by
casting a bridged object to an array before calling `serialize()`.

## HTTP and `allow_url_fopen`

Vrzno implements `http` and `https` stream wrappers using JavaScript `fetch()`.
Normal PHP stream functions can therefore make requests when `allow_url_fopen`
is enabled.

```php
<?php
var_dump(file_get_contents('https://jsonplaceholder.typicode.com/users'));
```

The supported HTTP context options are `method`, `content`, `header`, and
`ignore_errors`.

## Limitations

- JavaScript places properties and methods in one namespace, while PHP keeps
  them separate. If a PHP object exposes both `$x->y` and `$x->y()`, the method
  name currently wins when accessed from JavaScript.
- PHP classes are not exposed to JavaScript as constructible classes.
- Static PHP methods are not currently proxied back to JavaScript.

See the [Vrzno repository](https://github.com/seanmorris/vrzno) for build and
integration-test instructions.
