# php-wasm-curl

`php-wasm-curl` provides PHP's `curl` extension for `php-wasm`. Requests go through
the host's `fetch()`.

PHP's own `ext/curl` is compiled unchanged against
[php-wasm-curl](https://github.com/seanmorris/php-wasm-curl), a small library that
implements the libcurl C API over `fetch()`. `curl_init()`, `curl_setopt()`,
`curl_exec()`, `curl_multi_*`, `CURLFile` uploads and `curl_getinfo()` behave as
they do natively, so HTTP clients such as Guzzle and WordPress's Requests library
work as-is.

## Install

```sh
npm install php-wasm php-wasm-curl
```

## What It Loads

The package resolves the active runtime version to `php8.x-curl.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import curl from 'php-wasm-curl';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [curl],
});

await php.run(`<?php
  $ch = curl_init('https://example.com/api/status');
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  echo curl_exec($ch);
`);
```

`curl_exec()` waits for the response, so PHP code stays synchronous. Handles in a
`curl_multi` run their requests concurrently.

## Differences From Native curl

- Only `http://` and `https://` URLs are supported. Other schemes fail with
  `CURLE_UNSUPPORTED_PROTOCOL`.
- Responses are buffered and then passed to the write and header callbacks, so
  progress callbacks run once, after the transfer.
- `fetch()` always decodes compressed responses. The `Content-Encoding` header is
  removed and `Content-Length` describes the decoded body.
- TLS is handled by the host: certificates are always verified, and the
  `CURLOPT_SSL_*`, CA and client-certificate options have no effect. Connection,
  DNS and keep-alive options are accepted and ignored, including
  `CURLOPT_CONNECTTIMEOUT`; `CURLOPT_TIMEOUT` and `CURLOPT_TIMEOUT_MS` apply.
- Proxies (`CURLOPT_PROXY`) and Unix sockets are not supported.
- There is no cookie engine: `CURLOPT_COOKIEFILE` and `CURLOPT_COOKIEJAR` are
  ignored. `CURLOPT_COOKIE` and `Cookie:` headers are sent where the host allows.
- `Host`, `Content-Length`, `Connection`, `Expect` and other hop-by-hop request
  headers are set by `fetch()` and cannot be overridden.

### In Browsers

- Requests obey the page's origin rules. A cross-origin request needs CORS headers
  from the server; otherwise it fails with `CURLE_COULDNT_CONNECT`, and only the
  CORS-exposed response headers are visible.
- Browsers drop forbidden request headers such as `Cookie`, `Origin` and
  `Referer` set through `CURLOPT_HTTPHEADER`.
- Browsers hide redirect responses from `fetch()`, so redirects are always
  followed there. Node, Deno, Bun and Cloudflare Workers report them as usual when
  `CURLOPT_FOLLOWLOCATION` is off.

## Custom Builds

`WITH_CURL` is off by default for now. Build the extension with
`WITH_CURL=dynamic`, optionally pointing `CURL_DEV_PATH` at a local checkout of
php-wasm-curl:

```sh
make packages/curl/php8.4-curl.so PHP_VERSION=8.4 WITH_CURL=dynamic CURL_DEV_PATH=../php-wasm-curl
```

## Build Options

- `WITH_CURL`: defaults to `0`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `CURL_REPOSITORY`, `CURL_REF` (a pinned commit) or `CURL_BRANCH`: where to fetch
  php-wasm-curl from.
- `CURL_DEV_PATH`: build from a local checkout instead.
