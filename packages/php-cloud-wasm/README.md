# php-cloud-wasm

Embedded PHP 8.0–8.5 for Cloudflare Workers, with statically linked Vrzno,
ordinary ZIP/deflate, zlib and the prepared-query subset of PDO-CFD1.
This package is independent of the browser/Node `php-wasm` package.

Use a version-specific entry inside a Worker module:

```js
import { PhpCloudflare } from 'php-cloud-wasm/php8.5-cloudflare.mjs';

export default {
  async fetch(request, env) {
    const php = new PhpCloudflare({ cfd1: { mainDb: env.DB } });
    const version = await php.exec('return PHP_VERSION;');
    return new Response(String(version));
  }
};
```

The generated entry statically imports its matched Wasm module. Upload the
uncompressed manifest-owned modules as Worker modules; do not fetch and compile
Wasm at request time. Use an explicit module inventory if a bundler rejects the
unused dynamic-import helper in the generated factory. No eval permissions are
required. JavaScript eval, dynamic extensions and persistent filesystems are not
supported; PHP eval and request-local PHP execution are supported.

The generic `php-cloud-wasm/PhpCloudflare` adapter additionally requires a matched
`runtime`, precompiled `wasmModule`, and `version`. Version-bound entries supply
these automatically. There is no implicit latest-version root entry.

PDO-CFD1 is compiled into PHP. Supply a request-local binding map and use
`new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION])`
with positional prepared queries. Transactions and general PDO APIs outside the
prepared-query subset are unsupported. Never expose arbitrary PHP/SQL execution
or arbitrary D1-binding names to untrusted HTTP clients.

Wasm memory is initially 64 MiB, with a 96 MiB maximum, per instance. Workers'
128 MB isolate budget is shared by concurrent requests and JavaScript overhead;
local runtime tests do not establish production capacity. Bound concurrency and
application memory use. ZIP AES/encrypted archives are not part of this profile.

Each PHP version has a `php<version>-cloudflare.manifest.json` owning its matched
runtime, Wasm, helpers, declarations and package metadata. Nightly downloads may
also include HTTP Brotli/gzip sidecars, which are not Worker modules. See the
repository's [Cloudflare guide](https://github.com/seanmorris/php-wasm/blob/master/CLOUDFLARE.md)
for build, artifact-only tests and deployment details.
