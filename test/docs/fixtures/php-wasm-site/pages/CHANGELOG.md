<!--
Vendored from php-wasm-site working tree based on commit 30bc147c87d58caf7c40bdaa36f1288188d56c91
Source: https://github.com/seanmorris/php-wasm-site/blob/30bc147c87d58caf7c40bdaa36f1288188d56c91/pages/CHANGELOG.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# php-wasm

Changes

> Latest nightly artifact build: `Build Artifacts` run `#92` on `develop`, published on February 24, 2026. GitHub Actions run: <https://github.com/seanmorris/php-wasm/actions/runs/22360005357>. Nightly builds are announced in `#nightly-builds` on the `php-wasm` Discord server.

## Nightly changes - May 8-13, 2026

### Runtime & packaging

* Shared-object packaging was cleaned up across the extension packages so runtime-loadable modules expose a more consistent JS package surface and test/build plumbing no longer carries duplicate per-package loader rules.
* Static and shared test paths stopped carrying their own separate stdlib/runtime assumptions. Shared-lib resolution is now centralized in the Node test wrappers so package smoke tests, docs fixtures, demos, and CLI-node PHPT runs follow the same loader rules.
* Static and shared builds now treat OpenSSL support more like a built-in runtime feature: `libssl` and related support no longer have to be re-injected in the same places as dynamic extension packages, and the CI matrix was updated to match the new static SSL layout.
* Shared runtime loading now distinguishes built-in extensions from third-party support libraries. That fixes cases like `intl`, where shared builds should load ICU support libraries without trying to reload `php8.x-intl.so`.
* The ICU data filter was refreshed to trim collation payload size without regressing the currently tested `intl` surface.

### Demo & worker loading

* Shared `demo-web` CGI workers now keep a split ESM module graph instead of collapsing every shared runtime into one oversized service-worker bundle.
* `demo-web` was updated to lazy-load CGI worker instances and to supply shared support libraries more accurately, including the missing ICU/shared-lib path that was breaking shared worker runs.
* Browser and Node demo/test harnesses were updated to follow the same shared-lib resolution rules as the package runtimes.

### XML, libxml & extension fixes

* Fixed XML-family shared and dynamic regressions across supported PHP versions, including `xml_parser_create()` and file-backed `SimpleXML` and `DOMDocument` paths.
* The libxml/XML patch set for PHP `8.0` through `8.5` was corrected and realigned so rebuilt runtimes behave consistently across versions.
* Added the `php-wasm-xmlwriter` package and wired it into the extension packaging, smoke tests, and runtime loader coverage.

### PHPT & test coverage

* Expanded direct `php-cli-node` PHPT coverage across `tests/lang`, `dom`, `simplexml`, `xmlwriter`, `zlib`, `sqlite3`, `tidy`, `iconv`, and `intl`.
* The PHPT runner now handles malformed section headers, version-specific renamed tests, `%r` patterns in `EXPECTF`, `{PWD}` ini expansion, and modern fatal-error output with stack traces.
* XMLWriter was added to the CI env matrix, and the CLI-node PHPT inventory was pushed much deeper across all supported PHP versions.

### CI & harness stability

* `demo-web` artifact smoke testing was added to CI so built web artifacts are exercised after packaging, not just built.
* Shared-build smoke tests for Node and Deno were corrected so built-in extensions are not redundantly loaded as if they were dynamic modules.
* The Node CGI harness picked up startup and dependency fixes, including better startup timing behavior and workflow fixes around missing install/setup steps.
* Build jobs that depend on upstream downloads now use more resilient retry behavior, and cross-version rebuild cleanup was tightened so stale generated headers and wrappers do not poison later builds.

## v0.0.9 - Aiming for the (GitHub) Stars

* Adding PHP-CGI support!
* Runtime extension loading!
* libicu, freetype, zlib, gd, libpng, libjpeg, openssl, & phar support.
* php-wasm, php-cgi-wasm, & php-wasm-builder are now separate packages.
* Vrzno now facilitates url fopen via the fetch() api.
* pdo_cfd1 is now a separate extension from Vrzno.
* pdo_pglite adds local Postgres support.
* SQLite is now using version 3.46.
* Demos for CodeIgniter, CakePHP, Laravel & Laminas.
* Drupal & all other demos now use standard build + zip install.
* Modules are now webpack-compatible out of the box.
* Exposing FS methods w/queueing & locking to sync files between tabs & workers.
* Fixed the bug with POST requests under Firefox.
* Adding support for PHP 8.3.7
* Automatic CI testing for PHP 8.0, 8.1, 8.2 & 8.3.

## v0.0.8 - Preparing for Lift-off

* Adding ESM & CDN Module support!
* Adding stdin.
* Buffering stdout/stderr in javascript.
* Fixing `<script type = "text/php">` support.
* Adding fetch support for `src` on above.
* Adding support for libzip, iconv, & html-tidy
* Adding support for NodeFS & IDBFS.
* Custom builds.
* Updating PHP to 8.2.11
* Building with Emscripten 3.1.43
* Modularizing dependencies.
* Compressing assets.

## 0.0.7 - Remodermizing

* Updating PHP to 8.2.4
* Updating SQLite to 3.41
* Updating Drupal to 7.95
* Correcting hiccups in the build process

## 0.0.6 - Ease

* Correcting hiccups in the build process

## 0.0.5 - Alignment

* Ensuring npm & github have matching tags
* Ensuring Drupal re-builds correctly with no nested duplicate directory
* Removing some extraneous files from example application
* Separating php-web-drupal from php-web for real this time
* Publishing php-web-drupal to npm

## 0.0.4 - Revisiting

* Separated Drupal from standard php-web to save bandwidth
* Running the build automatically on push in CircleCI
* Getting the automatic build working for Drupal

## 0.0.3 - New Horizons

* php.exec() may be used to evaluate a single php expression & return its result.
* php may now access & traverse the dom and access nodes.
* The querySelector method is available on dom nodes.
* addEventListener/removeEventListener is also available on dom nodes.
* sqlite3 v3.33 is now statically linked to php & the sqlite3 extension is enabled.
* The following extensions are now enabled: sqlite3, pdo, & pdo-sqlite.
* Totally revamped build process that tracks build artifact relationships.
* Builds for web, node, shell, worker & webview.

## 0.0.2 - Gaining Momentum

* php objects now have persistent memory, may be cleared with `php.refresh();`.
* php code may now access Javascript (and thus, the DOM) via the [VRZNO](https://github.com/seanmorris/vrzno) project. The extension is preinstalled with php-wasm.
* `<script type = "text/php">` tags are now supported, both inline and with `src=...`. Both require opening tags as of now.
* Building of object files is now separated from building of binary files so multiple binaries may be built from the same set of objects.
* License changed from MIT to Apache-2.0, which has similar terms, but USERS must have visibility of the attribution, rather that just DEVELOPERS.
* Build dependencies are now expressed in the makefile
* Project can be built in its entirety by running `make`.
* Ensuring newlines in PHP output are respected.

## 0.0.1 - Humble Beginnings

* Event-oriented interface added to php object.
* Buildscript was slightly improved with a makefile
