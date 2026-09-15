# Cloudflare embedded PHP

The Cloudflare profile builds embedded PHP 8.0–8.5 as ES modules for Workers.
It includes Vrzno, statically linked zip/zlib, and PDO-CFD1 with native
parameters, binary values, and atomic batches. It is separate from the general
browser, Node and CGI builds: neither the normal worker artifact nor
`LIB_TYPE=static` selects it.

## Build and test locally

With the project dependencies and builder Docker image available:

```sh
npm ci
make cloudflare-mjs ENV_FILE=profiles/cloudflare.mak PHP_VERSION=8.3
make test-cloudflare PHP_VERSION=8.3
```

The builder CLI also accepts `php-wasm-builder build cloudflare mjs`. Cloudflare
is embedded PHP only: JavaScript/CommonJS, CGI, CLI and debugger combinations
are rejected. `profiles/cloudflare.mak` is the default Make configuration for
this target. Select another file with `ENV_FILE`, or include the profile from
your `.php-wasm-rc` when using the CLI:

```make
include profiles/cloudflare.mak
INITIAL_MEMORY = 48MB
```

Compilation uses the ordinary Make and Docker Compose recipes. The profile
opts into the shared `BUILD_WORKSPACE` mechanism, which keeps native sources,
libraries and configure caches under `.cache/build`. Native inputs, the selected
configuration, Make overrides and builder image identify the workspace. Repeated
builds reuse it; wrapper-only changes refresh their files without rebuilding PHP.
Changing native settings selects separate state and preserves earlier builds.

Use `BUILD_WORKSPACE=/path/to/cache` to place this state elsewhere. The older
`CLOUDFLARE_CACHE_DIR` setting remains an alias in the default profile. A caller
managing a dedicated clean checkout can pass `BUILD_WORKSPACE=` to build directly
there. Do not reuse native state from a different configuration in that mode.
The CLI keeps workspace state in the caller's project and honors its
`.php-wasm-rc`. `CLOUDFLARE_OUTPUT_DIR` selects the final package destination.

Make retains its raw JavaScript/Wasm outputs separately from the final package.
The packaging helper hashes a copy, generates the static Wasm import and
declarations, records provenance, and validates the package before replacing
public artifacts. Configure diagnostics remain in each workspace's
`third_party/php<version>-src/config.log`; CI also uploads the Make build log.

The build produces the standalone `php-cloud-wasm` package under
`packages/php-cloud-wasm`:

- `php8.3-cloudflare.mjs`: stable, version-bound public entry.
- `php8.3-cloudflare-runtime.mjs`: generated low-level factory.
- A content-addressed `.wasm` file and the wrapper's helper modules.
- `php8.3-cloudflare.manifest.json`: file digests and build provenance.
- Its own `package.json`, declarations, README, LICENSE and NOTICE, all included
  in the verified artifact rather than supplied by the checkout.

The public entry is generated after Wasm hashing and statically imports the
factory and compiled Wasm module. Keep the entire manifest-listed set together;
do not substitute a similarly named older Wasm file or fetch/compile its bytes
inside a request.

The generated Vrzno runtime retains an unused `import(name)` helper. Module
discovery tools can reject that expression even when the application never
calls it. The test harness supplies an explicit module inventory: manifest-owned
`.mjs` files as `ESModule`, the hashed `.wasm` as `CompiledWasm`, plus its Worker
entry. Configure your application bundler/module uploader similarly if automatic
discovery rejects this helper. This does not enable external dynamic imports or
grant eval permissions; only packaged modules are made available.

`test-cloudflare` only reads and tests final artifacts; it never builds, repairs
or silently skips missing ones. To test an extracted nightly package:

```sh
CLOUDFLARE_ARTIFACT_ROOT=/path/to/extracted/packages/php-cloud-wasm \
  make test-cloudflare PHP_VERSION=8.3
```

The harness uses pinned Miniflare 4.20260730.0, compatibility date `2024-02-01`,
and no compatibility flags or unsafe-eval permissions. It creates local D1
databases, rejects unexpected outbound requests, and serves a deterministic
archive fixture. Build and test require no Cloudflare account or credentials.
See the [Miniflare module](https://developers.cloudflare.com/workers/testing/miniflare/core/modules/)
and [local D1](https://developers.cloudflare.com/workers/testing/miniflare/storage/d1/)
documentation for the engine facilities used by the tests.

## Worker usage

Copy the final package assets from the existing nightly distribution into your
application and preserve their relative paths. This example assumes the copied
directory is named `php-cloud-wasm` beside the Worker entry. Configure your application's
bundler to preserve static Wasm imports as compiled Wasm modules.

```js
import { PhpCloudflare } from './php-cloud-wasm/php8.3-cloudflare.mjs';

export default {
  async fetch(request, env) {
    const php = new PhpCloudflare({
      cfd1: { mainDb: env.DB },
      shared: { name: new URL(request.url).searchParams.get('name') ?? 'World' },
    });
    let output = '';
    php.addEventListener('output', event => { output += event.detail.join(''); });
    await php.run(`<?php
      $pdo = new PDO('cfd1:mainDb', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      ]);
      $query = $pdo->prepare('SELECT ? AS message');
      $query->execute(['Hello, ' . vrzno_shared('name')]);
      echo json_encode($query->fetch(PDO::FETCH_ASSOC));
    `);
    return new Response(output, {
      headers: { 'content-type': 'application/json' },
    });
  },
};
```

`env.DB` is the application's D1 binding; `mainDb` is the corresponding PHP DSN
name. Create the PHP instance inside each request so bindings, shared values,
PHP globals and the in-memory filesystem are request-local. The instance queue
serializes overlapping PHP operations on that instance; it is not a global
request queue or cross-request isolation mechanism.

`run()` accepts PHP source beginning with `<?php`; `exec()` evaluates a PHP
expression without tags or a trailing semicolon and returns its string value.
Await either method. Vrzno supports asynchronous JavaScript calls and callbacks.
PHP `eval()` remains available; JavaScript string evaluation through `vrzno_eval`
is deliberately unavailable. Do not evaluate untrusted PHP source.

For application archives, fetch a trusted, application-controlled URL inside the
request, write its bytes into the instance, then extract and load its PHP:

```js
const archive = await fetch('https://your-app.example/releases/application.zip');
if (!archive.ok) throw new Error(`Archive HTTP ${archive.status}`);
await php.writeFile('/application.zip', new Uint8Array(await archive.arrayBuffer()));
await php.run(`<?php
  $zip = new ZipArchive();
  if ($zip->open('/application.zip') !== true || !$zip->extractTo('/application')) {
    throw new RuntimeException('Cannot load application archive');
  }
  $zip->close();
  require '/application/index.php';
`);
```

Only load archives you control; bound their compressed and extracted sizes for
your workload. The regression suite exercises this flow using a fixed deflated
archive and mocked fetch, plus ZIP creation/readback and zlib round-trips.

## D1 scope and limitations

The profile includes PDO-CFD1 for PHP 8.0–8.5. Ordinary queries accept
positional or named parameter arrays through `execute([...])`; explicit binding
is optional. The driver supports numbered placeholders, `query`, `exec`, SQLite
quoting, connection-local insert IDs, BLOB strings/streams, and buffered scroll
cursors. Write `rowCount()` uses D1's affected-row metadata.

`$pdo->cfd1Batch([$insert, $select])` executes distinct, already bound PDO
statements from that connection in one atomic D1 batch. Results remain on their
statements for normal fetching, and ordinary `execute([...])` remains available
before and afterward. A failed batch follows PDO's error mode and does not expose
partial results. See the [PDO-CFD1 API and examples](packages/pdo-cfd1/README.md).

D1 does not support PDO transactions held open across PHP calls. Persistent
connections, output parameters, streaming cursors, and multiple result sets
remain unsupported. Metadata is limited to information D1 actually returns;
empty results and duplicate column names have documented limitations.
Dynamic/shared extensions, browser filesystem persistence,
and the CGI HTTP request adapter are outside this profile. Zip/zlib operate on
the instance's in-memory filesystem. Archive support is ordinary ZIP/deflate;
encrypted AES archives are omitted from this minimal static profile.

The default Wasm memory settings are 64 MiB initially and a 96 MiB maximum
**per PHP instance**. Cloudflare's 128 MB memory limit is shared by the entire
isolate, including concurrent requests, JavaScript objects and Wasm allocations;
it is not a separate allowance for each request or PHP instance.
See [Workers memory limits](https://developers.cloudflare.com/workers/platform/limits/#memory).
Even two initial PHP memories can consume the isolate allowance before JavaScript
and other overhead. Applications must validate and bound their actual concurrent
memory use. Local workerd concurrency tests check correctness, not production
capacity. Memory/CPU limits and workload sizing require separate validation;
a local test pass is not a production deployment or capacity guarantee.

## CI and nightly artifacts

The main build workflow has a separate six-version Cloudflare lane. Each version
builds in isolated native state, finalizes its assets, uploads only the files
listed by its verified manifest, and tests the extracted final package in
workerd. Missing files, digest mismatches, startup failures and hung async calls
fail the job. Diagnostics include the PHP version and execution phase.

Existing nightly publication waits for all six Cloudflare tests as well as its
existing dynamic-runtime tests. The merge validates digests and requires any
overlapping package metadata and helper modules to be byte-identical. Nightly
assets are uploaded to the existing R2 bucket at
`<timestamp>-<sha>/php-cloud-wasm/`. The package is self-contained; it does not
load the browser/Node package at runtime or for its types. Imports formerly
exposed by the unreleased Cloudflare additions to `php-wasm` now belong to
`php-cloud-wasm`, for example `php-cloud-wasm/php8.5-cloudflare.mjs`.
Nightly publication does not publish to the npm registry.

### Brotli is transport compression, not executable Wasm

Nightly publication keeps the original manifest-owned JavaScript and Wasm and
adds `.br` and `.gz` sidecars. Requests to the original URLs negotiate an
acceptable encoding while retaining the original MIME type. The handler sets
`Vary: Accept-Encoding`, prevents double compression, and respects quality-zero
exclusions. Decoded responses must match the original manifest hashes.
Cloudflare can rewrite the incoming `Accept-Encoding` header; negotiation uses
`request.cf.clientAcceptEncoding` when supplied so the original client's weights
and exclusions remain authoritative.

The live Worker uploads the **raw** Wasm as a compiled module alongside its
matching JavaScript. It never fetches, decompresses or compiles runtime bytes
inside a request. Brotli sidecars are only for artifact downloads. Pages has a
25 MiB multipart Worker-bundle limit; the staging/deployment checks enforce that
limit independently of compressed download sizes. See the
[Pages deployment API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/).

### Live nightly PHP and D1

The nightly Pages deployment includes fixed PHP demo routes under `/php/`:
the landing page, `/php/phpinfo`, `/php/d1` and `/php/health`. The selected runtime
is PHP 8.5, built by the same six-version lane and identified by the immutable
nightly build ID. The D1 checks use the compiled PDO-CFD1 driver and a typed
prepared query returning `42`. There is no public PHP upload, SQL input, or
database mutation endpoint; phpinfo omits environment and request-variable data.

Only one PHP execution is admitted per isolate; overlapping executions receive
503 while artifact requests continue independently. Instances and D1 handles
remain request-local. The Pages deployment targets Paid Workers, caps CPU at
1,000 ms and buffers at most 256 KiB of PHP output. It does not change billing.

One-time setup in the existing Cloudflare account, using normal authenticated
tooling (never a token pasted into a repository file):

```sh
npx wrangler d1 create php-wasm-nightly-demo
gh variable set NIGHTLY_PHP_D1_DATABASE_ID --repo seanmorris/php-wasm --body '<database UUID>'
```

The dedicated database needs no schema migration. The deployment binds it as
`NIGHTLY_PHP_DB`, preserving `NIGHTLY_BUILDS` for the existing R2 artifact routes.
Provisioning requires D1 creation permissions; nightly deployment uses the
existing `CLOUDFLARE_PAGES_API_TOKEN` and `R2_ACCOUNT_ID` GitHub secrets. Missing
authentication, an absent database ID or insufficient account permissions are
deployment blockers, not reasons to disable D1 verification.

The serialized publication job stages a Pages `_worker.js` **directory** with
only the selected version's exact modules. Pinned Wrangler 4.131.1 uploads it
with `--no-bundle`, preserving the module inventory despite Vrzno's unused
variable import helper. Advanced mode replaces the file-based Functions router;
the staged entry explicitly preserves the nightly R2 routes.

For local Pages development with this pinned Wrangler, use its development
facade and supply local bindings explicitly:

```sh
# Run inside the staged project directory; no cloud credentials are needed.
npx wrangler pages dev dist --d1 NIGHTLY_PHP_DB --r2 NIGHTLY_BUILDS --env-file /dev/null
```

Do not add `--no-bundle` to this **dev** command: Wrangler's development facade
currently fails to resolve its own injected modules in that mode. The release
command still uses `--no-bundle`. The integration suite separately executes the
exact, unchanged manifest-owned modules in strict workerd with local D1/R2;
the additional Wrangler smoke checks the development facade, not byte identity
of its in-memory rebundling.

After immutable assets are uploaded, release automation deploys a unique
preview, checks real PHP/D1 execution and artifact decoding, and then deploys
the unchanged stage to production branch `main`. Production is checked before
success is announced. If production verification fails, the previous Pages
deployment is restored when ownership and rollback can be confirmed. Pending or
unknown uploads are reported as unconfirmed recovery requiring intervention,
never as a successful rollback. No runtime is fetched from a mutable latest URL.
The obsolete source-only Pages deployment workflow is removed; all nightly
publication now goes through this serialized verification path.

Local routing, staging and release regression tests require no credentials:

```sh
npm run test:cloudflare-pages
```

After compression and staging, exercise the real PHP/D1/R2 modules as well:

```sh
CLOUDFLARE_PAGES_PROJECT_DIR=.cache/nightly-pages \
CLOUDFLARE_ARTIFACT_ROOT=packages/php-cloud-wasm \
  node --test test/cloudflare-pages/runtime.integration.mjs
```

## Why the old compiler cutoff no longer applies

The original 3.1.44 → 3.1.45 failure was not a newly introduced JavaScript eval
requirement. Emscripten [commit fa2a1f3 / PR #19900](https://github.com/emscripten-core/emscripten/commit/fa2a1f3346e7f6643628ab60a04f5e3a3826b98f)
changed `var asm = createWasm()` to `var wasmExports = createWasm()`. The custom
synchronous hook called `receiveInstance(instance)` and then returned the raw
`instance.exports`. The new assignment overwrote the Asyncify-wrapped exports
installed by the receiver. Synchronous PHP could work, but asynchronous rewind
failed or hung.

The upstream [fix 0070d12 / PR #23781](https://github.com/emscripten-core/emscripten/commit/0070d120707a5bd7e123c201527d87d9d609c183),
first included in 4.0.7, preserves the processed exports. The current 6.0.6
toolchain contains this fix. Our artifact test intentionally exercises the old
raw-exports hook with a real asynchronous PHP call inside a strict Worker
request; it does not depend on startup eval exceptions.

This does not make arbitrary dynamic code generation legal. General-purpose
`MAIN_MODULE=1` linking and explicitly requested JavaScript eval are separate
concerns. The Cloudflare profile uses static linking and tests that JavaScript
`eval`, `Function`, and request-time compilation from Wasm bytes remain blocked.
