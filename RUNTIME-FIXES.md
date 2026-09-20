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

GitHub issue records remain unchanged. The regression suites cover source
queues and cookies, Node ESM/CommonJS source evaluation, real browser requests
and worker refresh, native Vrzno object options, and isolated builder installs.
