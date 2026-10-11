# php-wasm-curl

`php-wasm-curl` provides PHP's `curl` extension for `php-wasm`. Requests go through
the host's `fetch()`.

PHP's own `ext/curl` is compiled unchanged against
[php-wasm-curl](https://github.com/seanmorris/php-wasm-curl), a small library that
implements the libcurl C API over `fetch()`. `curl_init()`, `curl_setopt()`,
`curl_exec()`, `curl_multi_*`, `CURLFile` uploads and `curl_getinfo()` are available
to HTTP clients such as Guzzle. Fetch and browser restrictions still apply; see
the differences below before relying on native curl behavior.

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
`curl_multi` run concurrently and finish independently, allowing Guzzle Pool to
start queued requests while slower requests are still running. Response headers
arrive before the body; downloads stream through write and progress callbacks.

### Guzzle

Install Guzzle with Composer and preload its files into the runtime's filesystem.
Its default handler, `CurlHandler`, and `CurlMultiHandler` use this extension.
Binary uploads, multipart files, sinks, progress callbacks, request cancellation,
timeouts, retry middleware, and Basic and Digest authentication are supported.
Digest supports MD5 and SHA-256, including session and `auth-int` variants.

Browsers hide intermediate redirect responses. To let Fetch follow redirects,
use a direct curl handler and explicitly enable following:

```php
$client = new GuzzleHttp\Client([
    'handler' => new GuzzleHttp\Handler\CurlHandler(),
    'curl' => [CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => -1],
]);
```

This delegates redirect handling to the browser. Guzzle's per-hop redirect
middleware and PHP cookie jar cannot inspect the hidden responses.

### Browser cookies

The browser owns cookies. Configure which requests may use them on the runtime:

```js
const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [curl],
  libcurlFetchOptions: {credentials: 'include'},
});
```

The default is `same-origin`; `omit` disables browser credentials. Cross-origin
`include` also requires credentialed CORS permission from the server and remains
subject to the browser's cookie policies. These options also work in `PhpWorker`
and CGI runtime constructors.

## Differences From Native curl

- Only `http://` and `https://` URLs are supported. Other schemes fail with
  `CURLE_UNSUPPORTED_PROTOCOL`.
- Downloads stream with incremental progress. Upload bodies are buffered before
  Fetch starts; upload progress and PHP's separate `stream` handler are not
  streaming upload support.
- `fetch()` always decodes compressed responses. The `Content-Encoding` header is
  and encoded `Content-Length` headers are removed. Cross-origin browser lengths
  may be unknown because CORS can hide the encoding header. Download statistics
  count decoded bytes.
- TLS is handled by the host: certificates are always verified, and the
  `CURLOPT_SSL_*`, CA and client-certificate options have no effect. Connection,
  DNS and keep-alive options are accepted and ignored, including
  `CURLOPT_CONNECTTIMEOUT`; `CURLOPT_TIMEOUT` and `CURLOPT_TIMEOUT_MS` apply.
- Proxies (`CURLOPT_PROXY`) and Unix sockets are not supported.
- There is no libcurl cookie engine: `CURLOPT_COOKIEFILE` and `CURLOPT_COOKIEJAR`
  are ignored. `CURLOPT_COOKIE` and `Cookie:` headers are sent where the host
  allows. Guzzle's CookieJar can manage visible cookies in server runtimes.
- `Host`, `Content-Length`, `Connection`, `Expect` and other hop-by-hop request
  headers are set by `fetch()` and cannot be overridden.

### In Browsers

- Requests obey the page's origin rules. A cross-origin request needs CORS headers
  from the server; otherwise it fails with `CURLE_COULDNT_CONNECT`, and only the
  CORS-exposed response headers are visible.
- Browsers drop forbidden request headers such as `Cookie`, `Origin` and
  `Referer` set through `CURLOPT_HTTPHEADER`.
- Browsers hide redirect responses from `fetch()`. With following disabled, a
  redirect fails with `CURLE_NOT_BUILT_IN` without visiting its target. Explicit
  following uses the browser's redirect limit; zero `CURLOPT_MAXREDIRS` is
  enforced, but positive per-request limits cannot replace the browser's limit.
  Server runtimes expose redirects and enforce the configured limit.
- Digest challenges must expose `WWW-Authenticate` through CORS. SHA-256 Digest
  requires Web Crypto, available in secure browser contexts such as HTTPS and
  localhost.
- Browsers may intercept HTTP authentication challenges with their own login
  prompt. Use `libcurlFetchOptions: {credentials: 'omit'}` to let PHP handle
  Digest negotiation itself; this also omits browser cookies.
- Fetch controls TLS, DNS, sockets and connection reuse. Some curl options are
  accepted for compatibility without changing that behavior.

## Custom Builds

`WITH_CURL=dynamic` is the default. The build pins the tested php-wasm-curl commit;
CI builds a versioned extension for PHP 8.0–8.5, and its static configurations
use `WITH_CURL=static`. Dynamic builds load curl explicitly through `sharedLibs`;
static builds have it available at startup.

Optionally point `CURL_DEV_PATH` at a local checkout:

```sh
make packages/curl/php8.4-curl.so PHP_VERSION=8.4 WITH_CURL=dynamic CURL_DEV_PATH=../php-wasm-curl
```

## Build Options

- `WITH_CURL`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `CURL_REPOSITORY`, `CURL_REF` (a pinned commit) or `CURL_BRANCH`: where to fetch
  php-wasm-curl from.
- `CURL_DEV_PATH`: build from a local checkout instead.

## Tests

From the main php-wasm checkout, build the extension, install the pinned Guzzle
fixture, and run its package tests against the matching Node runtime:

```sh
make packages/curl/php8.4-curl.so curl-test-deps PHP_VERSION=8.4
PHP_VERSION=8.4 WITH_CURL=dynamic node --test packages/curl/test/*.mjs
```

`make test-node` and `make test-browser` prepare the fixture automatically. The
browser suite tests streaming, cancellation, timeouts, cookies, CORS, redirects,
and Guzzle through the packaged extension. For the broader standalone C and
three-browser suite, see the
[library test guide](https://github.com/seanmorris/php-wasm-curl/blob/6085917954da9682c32ebcbea27a626d2308381b/test/guzzle/README.md).
