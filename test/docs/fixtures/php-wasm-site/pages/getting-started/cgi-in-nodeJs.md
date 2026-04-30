---
title: PHP-CGI for Node.js
weight: -500
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/getting-started/cgi-in-nodeJs.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpCgiNode.js
-->
# Php-Cgi-Wasm for Node.js

`PhpCgiNode` runs the CGI build of PHP inside Node.js and lets you serve requests through a normal Node HTTP server.

Use it when you want PHP to behave like a web application instead of an embedded expression runner. In practice that means:

- requests go through `php.request(...)`
- PHP reads from a document root
- cookies and CGI environment variables are managed for you
- files can persist to host directories with NodeFS mounts

## Install

```bash
npm i php-cgi-wasm
```

If you want runtime-loadable extensions, install the packages you plan to use as well:

```bash
npm i php-wasm-intl php-wasm-libxml php-wasm-phar php-wasm-mbstring php-wasm-openssl php-wasm-dom php-wasm-xml php-wasm-simplexml php-wasm-sqlite php-wasm-zlib php-wasm-gd
```

## Minimal HTTP server

This is the basic pattern:

```javascript
#!/usr/bin/env node
import http from 'node:http';
import { PhpCgiNode } from 'php-cgi-wasm/PhpCgiNode.mjs';

const php = new PhpCgiNode({
  prefix: '/php-wasm/cgi-bin/',
  docroot: '/persist/www',
  persist: [
    { mountPath: '/persist', localPath: './persist' },
    { mountPath: '/config',  localPath: './config'  },
  ],
});

const server = http.createServer(async (request, response) => {
  const result = await php.request(request);
  const reader = result.body.getReader();

  response.writeHead(result.status, [...result.headers.entries()].flat());

  let done = false;

  while(!done)
  {
    const chunk = await reader.read();
    done = chunk.done;

    if(chunk.value)
    {
      response.write(chunk.value);
    }
  }

  response.end();
});

server.listen(3003);
```

Open `http://localhost:3003/php-wasm/cgi-bin/` after creating a PHP app under `./persist/www`.

## Loading extensions

For the dynamic build, pass extension packages as `sharedLibs`:

```javascript
const php = new PhpCgiNode({
  prefix: '/php-wasm/cgi-bin/',
  docroot: '/persist/www',
  persist: [
    { mountPath: '/persist', localPath: './persist' },
    { mountPath: '/config',  localPath: './config'  },
  ],
  sharedLibs: [
    await import('php-wasm-intl'),
    await import('php-wasm-libxml'),
    await import('php-wasm-phar'),
    await import('php-wasm-mbstring'),
    await import('php-wasm-openssl'),
    await import('php-wasm-dom'),
    await import('php-wasm-xml'),
    await import('php-wasm-simplexml'),
    await import('php-wasm-sqlite'),
    await import('php-wasm-zlib'),
    await import('php-wasm-gd'),
  ],
});
```

`sharedLibs` works the same way here as it does in the other runtimes: extension packages resolve their `.so` files and supporting libraries automatically.

## Important options

### `docroot`

The PHP document root inside the emscripten filesystem.

```javascript
docroot: '/persist/www'
```

With the `persist` mounts above, that maps to `./persist/www` on the host.

### `prefix`

The URL prefix that identifies requests meant for this PHP application.

```javascript
prefix: '/php-wasm/cgi-bin/'
```

### `persist`

NodeFS mounts. These expose host directories to PHP.

```javascript
persist: [
  { mountPath: '/persist', localPath: './persist' },
  { mountPath: '/config',  localPath: './config'  },
]
```

This is how you keep application files, sessions, caches, and config across requests.

### `types`

Optional MIME type map for static files served through the CGI wrapper.

```javascript
types: {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  png:  'image/png',
  svg:  'image/svg+xml',
}
```

### `version`

Selects the PHP-CGI runtime version to load. `PhpCgiNode` currently defaults to `8.4`.

```javascript
version: '8.5'
```

### `rewrite`, `entrypoint`, `exclude`, `env`, `notFound`, `onRequest`

These work the same way as the CGI worker/web runtimes documented in [php-cgi-wasm methods](/methods/php-cgi-wasm.html):

- `rewrite` rewrites incoming paths before routing
- `entrypoint` forces a single PHP entry script such as `index.php`
- `exclude` bypasses PHP for matching URL prefixes
- `env` sets CGI environment variables
- `notFound` returns a custom 404 response
- `onRequest` lets you inspect each request/response pair

## What `php.request()` expects

`PhpCgiNode` accepts a Node HTTP request object directly:

```javascript
const result = await php.request(request);
```

Internally it normalizes the Node request into a URL plus headers map, then returns a standard `Response` object. That is why the server bridge above reads:

- `result.status`
- `result.headers`
- `result.body.getReader()`

## Cookies and config

The CGI runtime keeps its cookie jar under `/config/.cookies`. If `/config` is persisted to disk, cookies survive process restarts along with the rest of your mounted config.

The runtime also sets `PHP_INI_SCAN_DIR` to include `/config`, `/preload`, and the active document root, so project-local configuration files can be loaded from those paths.

## Multi-app routing

If you need to host more than one PHP app behind one Node server, `PhpCgiBase` also supports `vHosts` entries with:

- `pathPrefix`
- `directory`
- `entrypoint`

That lets one runtime serve multiple PHP applications by URL prefix from different directories.

## Related source

The current Node demo in the upstream repo lives at:

- [`demo-node/index.mjs`](https://github.com/seanmorris/php-wasm/blob/develop/demo-node/index.mjs)

The `PhpCgiNode` class itself is implemented at:

- [`source/PhpCgiNode.js`](https://github.com/seanmorris/php-wasm/blob/develop/source/PhpCgiNode.js)
