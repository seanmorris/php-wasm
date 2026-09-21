# php-wasm

Changes

## Unreleased

* SDL_mixer now decodes MP3 through its bundled minimp3 implementation. The cube plays the supplied **Unreal Superhero 3** by **Kenët and rez** and displays the artist credit from the file's ID3 tags.
* Embedded PHP links now store source in the URL fragment, avoiding request-header limits while preserving old query links. The SDL cube fills its preview and adapts its viewport, perspective, and text overlay to resizing without interpolating its pixel-art texture.
* Expanded the `_sdl` browser runtime with SDL_image, SDL_mixer, SDL_ttf, and PHP 8 OpenGL shader bindings through the existing Make build. The SDL Cube demo uses the `sean-icon-32` texture with nearest filtering, text, focused keyboard controls, and audio after a user gesture. Added resource cleanup, context recovery, checked asset loading, and PHP 8.0–8.5 coverage across all three library profiles. See the [SDL guide](packages/sdl/README.md) for build flags, supported APIs, and measurements.
* Made the CGI queue timing tests portable to pinned Deno 2.5.6 without changing the 25 ms idle wait or 250 ms processing bound. The fast Deno gate now includes the queue suite before native builds.
* Browser CGI now journals filesystem mutations and commits only changed IDBFS records, avoiding full-tree scans at the end of each request. Existing storage remains compatible. Failed commits retain changes for retry; renamed trees, native writes, metadata, symlinks and deletions are covered by browser persistence tests. Symlinks hydrate their own metadata without following their targets.
* Restored the browser CGI filesystem queue's 25 ms idle batching window. Concurrent calls share hydration and persistence, mixed read/write batches always commit, and acknowledgments wait for the shared commit. Failed commits reject the whole batch, and bounded batches release the lock for other work. HTTP CGI requests retain their per-request flush.
* Recover failed CGI startup with two automatic retries after 1 and 2 seconds, including registration and replacement failures. Saved files are preserved; a manual startup retry appears only after all three attempts fail. Framework and VS Code startup share the readiness check. Worker assets use flat hashed paths so Vite serves rebuilt dependencies reliably.
* Added typed directory listings with `readdir(path, {withFileTypes: true})` across runtime wrappers and declarations. Browser CGI reads refresh storage without flushing, and writes still wait for persistence. The VS Code bridge forwards listing options so updated File Bus hosts can expand and search directories without per-entry RPCs.
* Expanded the lightweight editor's file handling with explicit Save, untitled documents, file/folder operations, transfers, recovery, and conflict checks. Empty workspaces retain a saveable untitled document. Removed the redundant standalone Waitline link from the home-page extras.
* Expanded PDO-CFD1 with named/numbered parameters, direct execution, quoting, insert IDs, binary values, buffered scroll cursors, and result metadata. Atomic `cfd1Batch()` reuses bound PDO statements; ordinary `execute([...])` remains available without explicit binding.
* Cloudflare builds now use the ordinary Make/Docker Compose flow and a selectable configuration file. The CLI honors `.php-wasm-rc`; shared build workspaces preserve incremental native state across unchanged builds and isolate different configurations. Packaging leaves the raw JavaScript/Wasm pair intact.
* Consolidated the PGlite, CFD1, Vrzno, and Waitline source importers and their regression fixtures. Each package command passes its policy to one shared importer in the builder workspace; refs, input policies, manifests, and build behavior are preserved. CI covers checkout, installed builder, Cloudflare snapshot, and Docker ownership layouts, including CFD1. See the [importer maintenance notes](bin/README.md).
* Import the PHP 8.0–8.5 PDO-CFD1 driver directly from its upstream commit. The driver fixes and unit tests now live in PDO-CFD1; php-wasm no longer applies or ships a compatibility patch. Existing imported-source manifests migrate to the direct source on the next build.
* Corrected runtime declarations and package exports for Deno, TypeScript Bundler/NodeNext resolution, and CommonJS. Existing wrapper import paths remain supported; CommonJS entrypoints now select matching `.d.cts` declarations. Constructor values come from the wrapper modules, while `public` exposes types.
* TypeScript consumers should await `tokenize()` for its serialized string result, use the metadata returned by `mkdir()`, and expect unsigned `HEAPU8` bytes. `readFile()` now distinguishes UTF-8 text from binary bytes; `writeFile()` accepts strings and ArrayBuffer views, matching Emscripten FS.
* CLI `run()` accepts optional string flags. Node CLI can resolve to `undefined` for runtime errors without an exit status; browser CLI rejects those errors. Embedded `run()` requires PHP source. Browser refresh methods return `Promise<void>`, embedded refresh returns a numeric result, and CGI refresh returns its binary. CGI `putEnv()` returns a number, and CGI wrappers do not inherit `EventTarget`. Debugger declarations now include `isRunning()`, synchronous `dumpSymbols()`, optional symbol tables, file arrays, and structured backtraces.
* Added `npm run test:types` with pinned Deno 2.5.6, strict isolated npm fixtures, declaration checking, and coverage for all six generated Cloudflare versions. Both CI workflows run these checks before native builds. Regenerate CommonJS declarations and export mappings with `npm run generate:types`.
* Artifact packaging now stages every declared wrapper with `make runtime-wrappers`, independent of the selected native profile. The isolated type fixtures use the same Make target and verify every explicit package export is present in the npm tarball.
* Dynamic extensions and support libraries now preserve their native frames when PHP callbacks await JavaScript. This fixes crashes when libxml warning handlers perform asynchronous work, such as database logging. Rebuild side modules with the current Make flags.
* Asyncify import rejections and failed unwinds or rewinds now reach the caller with the original error. Failed instances reject later native calls. CGI returns a non-cacheable HTTP 500 and replaces the runtime before queued requests proceed; replacement initialization failures also produce HTTP 500 responses.

## v0.1.0 - Aiming for the (GitHub) Stars

* Rebuilt `demo-web` around Vite, reorganized it into `pages`, `components`, `lib`, and `assets`, and added the newer browser/e2e harnesses plus runtime path helpers for the worker and page builds.
* Added Quickbus-backed browser messaging, a richer `phpdbg` bus session, and a VSCode debugger bridge for the demo app and debugger workflow.
* Expanded runtime/build coverage across older targets, including `phpdbg`, SDL, and Vrzno support in PHP `8.0` builds. SDL now ships as the `_sdl` runtime variant instead of a separately loaded shared library.
* Added `version` and `variant` support to `php-tags`, making it possible to select non-default runtimes from static HTML.
* Standardized the maintained runtime sources on `.mjs` modules and expanded type/JSDoc coverage across `php-wasm`, `php-cgi-wasm`, `php-cli-wasm`, `php-dbg-wasm`, and the extension helper packages.
* Reworked shared and dynamic extension loading so built-in support libraries, ICU payloads, OpenSSL, libxml/XML, DOM, SimpleXML, XMLReader, and XMLWriter behave consistently across Node, browser, demo, and docs/test harnesses.
* Suppressed implicit `libxml2.so` loading when it is not provided in `sharedLibs`, which reduces startup download size for minimal runtime configurations.
* Broadened verification with vendored `php-wasm-site` docs fixtures, split docs/CGI coverage suites, deeper CLI-node PHPT coverage, richer XML/intl/tidy/iconv/sqlite smoke tests, and browser-test race-condition fixes.
* Tightened the build/test pipeline by preserving `BUILD_TYPE` through CI, adding a dynamic fallback when it is omitted, smoke-testing packaged demo artifacts, centralizing shared-lib resolution, and refreshing the workflow matrix for the newer runtime surface.
* Improved local workspace and release plumbing with symlink-aware package loading, action-artifact overlay support, and refreshed README/package docs around runtime defaults, versioned `.wasm` assets, extension wiring, interactive CLI/debugger behavior via `waitline`, and Cloudflare D1 setup through `pdo_cfd1`.

## v0.0.9 - Here there be dragons

*Version 0.0.9 is represented by a near endless stream of letter-tagged alpha releases and will be considered officially skipped. The changes in v0.1.0 mostly landed somewhere in this range, but since the API is not stable, here there be dragons.*

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
* Adding support for PHP 8.3.7 & 8.4.1.
* Automatic CI testing for PHP 8.0, 8.1, 8.2, 8.3, & 8.4.

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
