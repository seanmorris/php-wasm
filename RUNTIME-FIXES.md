# Runtime fixes and builder release preparation

These changes are prepared for a future release. Package versions are unchanged;
preparing the artifacts does not publish packages, push images, or deploy sites.

- **CGI filesystem concurrency (#83):** browser requests, filesystem RPCs, and
  refreshes share one lock, including PHP suspension and persistence. A failed
  commit returns HTTP 500 with `Cache-Control: no-store`. `onRequest` runs once
  with the final response after persistence has been attempted.
- **Cookie expiry (#57, #53):** persisted cookies retain absolute expiry
  deadlines. Refreshing a worker cannot restart `Max-Age`. Legacy relative
  lifetimes without a receipt time are discarded; affected users may need to
  sign in again. Legacy session cookies and unexpired absolute deadlines remain.
- **PHP object options (#98):** Vrzno maps absent PHP properties to JavaScript
  `undefined`, while preserving explicit `null` and magic property behavior.
  PHP objects can supply only the options needed by native `Request` and `fetch`.
  Code that used `=== null` to detect an absent property should use `=== undefined`.
- **Strict source (#52):** `run()` accepts an initial PHP opening tag followed
  by `declare(strict_types=1)` or a namespace without inserting an output
  statement. Mixed PHP/HTML and original line numbers remain supported.
- **Builder packaging (#70):** `make package-builder` produces an installable
  source tarball and SHA-256 manifest in `.cache/release/`. Both
  `php-wasm-builder` and `php-wasm-build` run the existing Make targets. Build
  templates and image helpers ship with the package; generated native files,
  local configuration, and credentials do not. The release script includes the
  staged tarball in its default dry run.
- **WebPerl coexistence (#91):** the current modular Emscripten build scopes its
  debug globals to the PHP module. An obsolete export-name rewrite has also been
  removed so assertions-enabled browser modules can initialize. Regressions
  exercise the historical WebPerl 0.09-beta distribution before and after PHP.
  Replace affected old
  generated PHP assets as a matching JavaScript/Wasm pair; a wrapper-only update
  cannot repair a global hook already embedded in an older generated module.
- **Local PHP tags (#54):** the loader waits for the initial HTML document to
  finish parsing. Fast local `async` modules can run in `<head>` without accessing
  a missing body or reading an incomplete PHP script. Local URLs must still
  resolve to the served package and its matching JavaScript/Wasm assets.
- **First CGI messages (#63):** `sendMessageFor()` follows an already-installing
  worker through activation before sending its first RPC. Failed installations,
  missing registrations, lookup failures, and message-cloning failures reject
  instead of leaving the caller pending. The startup failure reproduced in both
  normal and incognito Chromium. Storage worked in both; an injected storage
  denial rejects explicitly. This does not establish storage support in every
  private browser mode.
- **Class-name corruption (#96):** the published `0.0.8` browser build reproduces
  truncated JavaScript class names. The current native build already uses the
  stable `Vrzno` debug name and passes repeated comparisons. A browser regression
  preserves that behavior; JavaScript constructor names are not restored.
- **SDL startup output:** the SDL build patches 18 missing `__toString(): string`
  declarations in the pinned extension. PHP 8 startup warnings no longer precede
  application output or corrupt JSON responses. Browser coverage checks all 22
  string-conversion declarations and a real conversion with warnings enabled.
  This requires a rebuilt matching JavaScript/Wasm pair.

GitHub issue records remain unchanged. The regression suites cover source
queues and cookies, Node ESM/CommonJS source evaluation, real browser requests
and worker refresh, early HTML loading, worker activation, native Vrzno object
options, and isolated builder installs.
