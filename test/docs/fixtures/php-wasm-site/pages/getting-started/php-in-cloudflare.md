---
title: PHP in Cloudflare
pagetitle: PHP in Cloudflare Workers and Pages
weight: -650
---
<!--
Vendored from php-wasm-site commit bdf1555ad207242ac09292ff05b125f006a9d049
Source: https://github.com/seanmorris/php-wasm-site/blob/bdf1555ad207242ac09292ff05b125f006a9d049/pages/getting-started/php-in-cloudflare.md
-->
# PHP in Cloudflare Workers and Pages

Use **`php-cloud-wasm`** to run embedded PHP in Cloudflare's Worker runtime.
Its dedicated profile supports PHP 8.0–8.5 and includes Vrzno, ordinary ZIP/deflate,
zlib, and PDO-CFD1 with native parameters, binary values, and atomic batches. It is not the general-purpose
`php-wasm` browser/Node package, the browser Service Worker adapter, or PHP-CGI.

This guide uses Pages advanced mode to match the original examples. You write
the HTTP handler in JavaScript and explicitly call PHP; uploading a `.php` file
does not make Cloudflare execute it. The same PHP adapter can be used in a
Module Worker when its uploader preserves the static Wasm imports.

## What the two example repositories demonstrate

[php-cloud](https://github.com/seanmorris/php-cloud) is the execution side:
its [Pages function](https://github.com/seanmorris/php-cloud/blob/0e8fd8f0cef47e4ff99f9471a4e5f7e3bf910b10/functions/%5B%5Bpath%5D%5D.js)
imports a Wasm module, maps requests to a separate static origin, runs fetched
PHP, and passes other resources through. Its origin map pairs the deployed
Worker with `php-static` on GitHub Pages, and local ports 8788 and 8081.

[php-static](https://github.com/seanmorris/php-static) supplies the application
side: PHP scripts, CSS, a wiki, and a
[ZIP-based autoloader](https://github.com/seanmorris/php-static/blob/cdcaa8540cd7fcdeb445e65dba35a9882acefa7d/CloudAutoloader.php).
That autoloader illustrates fetching package archives through JavaScript,
extracting them into PHP's in-memory filesystem, and loading PHP classes.
These are architectural examples, not an unchanged installation recipe for
the current package.

The examples were checked at the linked revisions on September 12, 2026.
Important migration differences are:

| Legacy examples | Current Cloudflare profile |
| --- | --- |
| Local `PhpWeb.mjs`, `php-web.mjs`, and `php-web.wasm` | Standalone `php-cloud-wasm` package and version-bound entry |
| Application supplies `instantiateWasm` | Generated entry imports its matched hashed Wasm; the adapter owns instantiation |
| `db` plus `vrzno:` DSNs in the old PDO example | `cfd1: { mainDb: env.DB }` and `new PDO('cfd1:mainDb', ...)` |
| File-based `functions/[[path]].js` routing | Explicit routing in the advanced-mode Worker below |
| Runtime lookup of public application/package sources | Prefer packaged code or pinned, verified sources you control |

The legacy [PDO example](https://github.com/seanmorris/php-static/blob/cdcaa8540cd7fcdeb445e65dba35a9882acefa7d/pdo.php)
uses an earlier Vrzno-backed DSN, not the current PDO-CFD1 interface.
Do not copy old instantiation hooks, JavaScript string evaluation, or
request-to-arbitrary-PHP routing into the new handler.

## 1. Build or obtain the complete package

Use a `php-wasm` checkout containing `packages/php-cloud-wasm` and the
`cloudflare-mjs` target. Do not assume an older npm release contains this profile.
With Node.js, npm, Make, and Docker available, run from that checkout:

```sh
npm ci
make image ENV_FILE=/dev/null
make cloudflare-mjs ENV_FILE=profiles/cloudflare.mak PHP_VERSION=8.5
make test-cloudflare PHP_VERSION=8.5
```

The current CLI also accepts `php-wasm-builder build cloudflare mjs`.
Use Make's explicit `PHP_VERSION` for the 8.5 example here. The target uses
`profiles/cloudflare.mak` by default and accepts another configuration through
`ENV_FILE`. The CLI honors `.php-wasm-rc`; include the Cloudflare profile there
when customizing it. Builds use the ordinary Make/Docker Compose recipes and
reuse unchanged native inputs in a configuration-specific build workspace.
Ordinary `LIB_TYPE=static` artifacts do not select this profile.

The final package contains `php8.5-cloudflare.mjs`, its low-level runtime, a
content-addressed `.wasm`, helpers, declarations, package metadata, and
`php8.5-cloudflare.manifest.json`. Keep the whole package and manifest together.
A tested nightly artifact can replace the build step; select one immutable
build containing **`php-cloud-wasm`**, not an ordinary worker binary.
Build and artifact-only tests need no Cloudflare credentials.

For an extracted artifact, run from the builder checkout:

```sh
CLOUDFLARE_ARTIFACT_ROOT=/path/to/extracted/packages/php-cloud-wasm \
  make test-cloudflare PHP_VERSION=8.5
```

See the [builder's Cloudflare guide](https://github.com/seanmorris/php-wasm/blob/master/CLOUDFLARE.md)
for the package contract and six-version tests. There is no implicit
latest-version package entry: choose `php8.5-cloudflare.mjs` explicitly.

## 2. Stage raw Worker modules

Create a separate `php-cloud-demo` project beside the `php-wasm` checkout:

```sh
mkdir ../php-cloud-demo
cd ../php-cloud-demo
npm init -y
npm install --save-dev --save-exact wrangler@4.131.1
```

Save this as `copy-runtime.mjs`. It verifies the final manifest and copies only
the selected version's executable modules into an empty stage:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyCloudflare } from '../php-wasm/bin/package-cloudflare.mjs';

const source = '../php-wasm/packages/php-cloud-wasm';
const output = 'dist/_worker.js/php-cloud-wasm';
const { manifest } = await verifyCloudflare(source, '8.5');
await fs.mkdir(output, { recursive: true });
if ((await fs.readdir(output)).length) {
  throw new Error('Use an empty runtime staging directory');
}
for (const file of manifest.files) {
  if (!/\.(mjs|wasm)$/.test(file.path)) continue;
  const bytes = await fs.readFile(path.join(source, file.path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== file.sha256) throw new Error('Changed artifact: ' + file.path);
  await fs.writeFile(path.join(output, file.path), bytes, { flag: 'wx' });
}
```

Run `node copy-runtime.mjs`. The layout is:

```text
php-cloud-demo/
  wrangler.toml
  dist/
    index.html
    _worker.js/
      index.js
      php-cloud-wasm/
        php8.5-cloudflare.mjs
        php8.5-cloudflare-runtime.mjs
        <content-hash>.wasm
        PhpCloudflare.mjs
        ...manifest-owned helpers...
```

Here `_worker.js` is a **directory**, not a JavaScript file. Pinned Wrangler
uploads this inventory with `--no-bundle`. The generated runtime has an unused
variable `import(name)` helper that automatic discovery can reject; do not work
around that by enabling eval or arbitrary external imports.

The version-bound entry already statically imports the factory and Wasm.
Upload the `.wasm` as a compiled Wasm module, not a URL or byte-buffer binding.
In Miniflare's explicit module inventory this type is `CompiledWasm`;
JavaScript files are `ESModule`. Instantiate PHP inside the request with the
precompiled module, not by fetching and compiling bytes during the request.
See [Cloudflare's Wasm API](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
and [Miniflare modules](https://developers.cloudflare.com/workers/testing/miniflare/core/modules/).

## 3. Write a fixed PHP and D1 handler

Save this as `dist/_worker.js/index.js`. It runs one fixed, read-only query at
`/php`, and forwards other paths to Pages static assets:

```javascript
import { PhpCloudflare } from './php-cloud-wasm/php8.5-cloudflare.mjs';

let running = false;

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/php') {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', {
        status: 405, headers: { Allow: 'GET' },
      });
    }
    if (running) {
      return new Response('PHP is busy', {
        status: 503, headers: { 'Retry-After': '1' },
      });
    }

    running = true;
    try {
      const php = new PhpCloudflare({ cfd1: { mainDb: env.DB } });
      let output = '';
      let outputBytes = 0;
      let failed = false;
      const encoder = new TextEncoder();
      php.addEventListener('output', event => {
        if (failed) return;
        const part = event.detail.join('');
        outputBytes += encoder.encode(part).byteLength;
        if (outputBytes > 64 * 1024) { failed = true; return; }
        output += part;
      });
      php.addEventListener('error', () => { failed = true; });
      const exit = await php.run(`<?php
        $pdo = new PDO('cfd1:mainDb', null, null, [
          PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $query = $pdo->prepare('SELECT ? AS answer');
        $query->execute([42]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['php' => PHP_VERSION, 'answer' => (int)$row['answer']]);
      `);
      if (exit !== 0 || failed) throw new Error('PHP execution failed or output limit exceeded');
      return new Response(output, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('PHP request failed', error);
      return new Response('PHP request failed', { status: 500 });
    } finally {
      running = false;
    }
  },
};
```

Add a small static `dist/index.html`, for example a page linking to `/php`.
Advanced mode replaces the `functions/` router and must explicitly forward
static requests; `env.ASSETS.fetch()` handles that here.
[Pages advanced-mode documentation](https://developers.cloudflare.com/pages/functions/advanced-mode/).

`DB` is the Cloudflare binding; `mainDb` is the key PHP sees in its `cfd1:` DSN.
No database schema is needed. Instantiate PHP per request so D1 handles, PHP
globals, shared values and filesystem contents are not reused across visitors.
The guard admits one PHP request per isolate; it is not a global queue or a
guarantee of production memory capacity.

The handler accepts no PHP source, SQL text, archive URL, or binding name
from clients. If you add input, validate it and use bound PDO parameters or
Vrzno shared values, not PHP-source concatenation. The example caps captured
output at 64 KiB and returns a generic error if PHP exits unsuccessfully or
writes to stderr; application-specific error handling may refine that policy.

## 4. Configure D1, test locally, and deploy

Create a D1 database using your own authenticated Cloudflare account:

```sh
npx wrangler login
npx wrangler d1 create php-cloud-demo
```

Put the returned database UUID into `wrangler.toml`:

```toml
name = "php-cloud-demo"
compatibility_date = "2024-12-01"
compatibility_flags = ["enable_weak_ref"]
pages_build_output_dir = "./dist"

[limits]
cpu_ms = 1000

[[d1_databases]]
binding = "DB"
database_name = "php-cloud-demo"
database_id = "REPLACE_WITH_YOUR_DATABASE_UUID"
```

Vrzno requires `WeakRef` and `FinalizationRegistry`; the flag enables weak
references with this retained compatibility date.

Database IDs identify resources; API tokens are credentials. Keep tokens out
of source files and use Wrangler authentication or your deployment secret store.
Pages supports configured D1 bindings and local D1 with `pages dev`.
[Pages D1 binding documentation](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases).

Start the local Worker and test it from another terminal:

```sh
npx wrangler pages dev dist --d1 DB --port 8788
curl --fail http://localhost:8788/php
```

For local development, pinned Wrangler generates a Pages wrapper that needs
bundling, and `--d1 DB` explicitly supplies the local binding. Using
`pages dev --no-bundle` can fail on Wrangler's generated wrapper before PHP
starts. This development workaround does not change the staged files:
production deployment below uses `--no-bundle` to preserve their original
module inventory. The project's direct Miniflare artifact tests separately
validate those unchanged JavaScript and compiled Wasm modules.

Expect JSON containing PHP `8.5.x` and `"answer":42`. Local D1 is separate from
your production database. The runtime's artifact suite also tests local-D1 CRUD,
missing bindings, errors and recovery.

After local verification, create a Pages project and deploy an explicit preview:

```sh
npx wrangler pages project create php-cloud-demo --production-branch main
npx wrangler pages deploy dist --project-name php-cloud-demo --branch preview --no-bundle
```

Check `/php` on the preview URL before promoting the same files with
`--branch main`. Confirm your account plan and Pages/Workers bundle, CPU and
memory limits first; the project's nightly PHP demo targets Paid Workers.
These commands deploy your own project, not the example repositories or the
php-wasm nightly service. Local success alone does not establish live capacity.

## Loading an application like php-static

The `php-static` repository deliberately hosts PHP as downloadable source.
You can adapt that separation, but use a fixed allowlist of entrypoints and an
immutable revision you control. Never publish credentials inside PHP on a static
host or turn a request pathname into an unrestricted remote-code loader.

For a small application, ship its PHP with your Worker and load it with
`php.writeFile()`, then `await php.run('<?php require ...;');`.
For an archive, fetch a pinned, trusted ZIP inside the request, verify its digest,
bound its compressed and extracted sizes, write it into PHP's filesystem, and
use `ZipArchive` to extract and `require` a fixed entrypoint. The builder guide
includes an [archive-loading example](https://github.com/seanmorris/php-wasm/blob/master/CLOUDFLARE.md#worker-usage).
Do not reproduce the old autoloader's mutable latest-package selection as a
production dependency policy; resolve dependencies and integrity data beforehand.

## Compression and runtime constraints

- **Brotli/gzip are download transports.** A nightly server may serve a sidecar
  behind the original `.wasm` URL with matching `Content-Encoding`, the original
  MIME type, and `Vary: Accept-Encoding`. Decode downloads before checking
  manifest hashes. Upload raw `.wasm` to the Worker, never a compressed sidecar
  disguised as a compiled module.
- **PHP eval is not JavaScript eval.** PHP `eval()` and Vrzno's asynchronous calls
  work; JavaScript string evaluation such as `vrzno_eval` is unavailable. No eval
  permission is needed for the supported adapter.
- **PDO-CFD1 supports ordinary execution and atomic batches.** Bare `?`, numbered
  `?NNN`, and named `:name` parameters, `execute([...])`, `exec()`, `quote()`,
  `lastInsertId()`, binary values, buffered scroll cursors and observed column
  metadata are supported. `cfd1Batch()` uses already bound statements; ordinary
  execution does not require explicit binding. Open transactions and streaming
  cursors remain unsupported. See [PDO-CFD1](/extensions/pdo-cfd1.html).
- **The filesystem is instance-local.** There is no browser persistence,
  dynamic/shared native extension loading, CGI adapter, or ordinary PHP server
  process. ZIP support excludes encrypted AES archives.
- **Memory is per instance, but the limit is per isolate.** PHP starts with
  64 MiB of Wasm memory and can grow to 96 MiB. The isolate's 128 MB allowance
  also covers JavaScript and concurrent requests. Even two initial PHP memories
  exhaust it before overhead; bound concurrency and test real workloads.
  [Workers memory limits](https://developers.cloudflare.com/workers/platform/limits/#memory).

For a deployment dynamic module-specifier error, check the explicit inventory
and `--no-bundle`; local `pages dev` uses the workaround above. For a Wasm trap
or mismatched artifact, verify the whole manifest
rather than swapping binaries. For D1 errors, check the Worker binding, the
`cfd1` map key, and the PDO DSN separately.
