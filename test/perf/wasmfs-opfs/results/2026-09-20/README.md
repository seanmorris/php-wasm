# CGI WasmFS/OPFS repeat benchmark — 2026-09-20

The full repeat completed **36 successful trials**, with three fresh persistent
Chrome profiles for each of six frameworks and two filesystem backends. Each
trial includes 20 warm requests, five byte-checked static requests, a rendered
page, and a validated response after restarting the service worker.

See [comparison tables and artifact sizes](results.md), [CSV](results.csv),
[summary JSON](summary.json), and [individual trial records](trials/).
The [reproduction instructions](../../README.md) describe the build and runner.

## Findings

Keep the existing filesystem default for now. This single-threaded asynchronous
OPFS candidate improves warm Drupal requests, but its warm responses are slower
for all five other frameworks. Its archive restores are about 10–34 times
slower. This is a result for this CGI adapter and backend, not a measurement of
a pthread or dedicated-worker synchronous OPFS design.

- Drupal's warm median drops from 545.7 ms to 383.2 ms, about 30%. Its median
  archive restore increases from 4.72 s to 84.25 s, and the first response after
  restore increases from 4.52 s to 45.81 s.
- OPFS worker-ready times after a persisted restart are lower for every
  framework. Counting the following framework response, Drupal, Laravel, and
  Laminas improve; WordPress, CakePHP, and CodeIgniter take longer. The report
  includes this combined measurement explicitly.
- The IDBFS control spends a median 477.9 ms in request-end synchronization for
  warm Drupal responses. Reducing unnecessary synchronization work is a useful
  next experiment before changing the storage backend.

Including the required Asyncify expansion, JS + Wasm grows from 44,738,105 to
45,267,597 bytes: **+529,492 raw (+1.18%)**, **+92,393 gzip (+0.76%)**, and
**+58,499 Brotli (+0.72%)**. Holding Asyncify constant, the filesystem-only
increase is 457,107 raw bytes, 74,663 gzip bytes, and 51,762 Brotli bytes.
The 30,873,664-byte ICU data file is identical in all three builds. Compression
uses timestamp-free gzip level 9 and Brotli level 11.

The pinned IDBFS implementation scans the local tree and the IndexedDB timestamp
index during synchronization. The asynchronous OPFS write adapter creates and
closes a writable stream for each write, and its reads use browser file/blob
operations. These mechanisms are plausible explanations for the observed
tradeoff; the experiment does not attribute every millisecond to individual
filesystem calls. See the pinned Emscripten 6.0.6
[IDBFS implementation](https://github.com/emscripten-core/emscripten/blob/6.0.6/src/lib/libidbfs.js)
and [OPFS implementation](https://github.com/emscripten-core/emscripten/blob/6.0.6/src/lib/libwasmfs_opfs.js).

## Conditions and scope

- PHP 8.3.11 CGI, Emscripten 6.0.6, internal Chromium 147.0.7727.15, Intel
  i7-7700K, eight logical CPUs. These are localhost measurements, not network
  download timings or mobile-browser results.
- Both timed binaries use the same static extensions, compiler image, native
  archives, full Asyncify, and a 128 KiB Asyncify stack. The separate
  `idbfs-pruned` build measures size with the usual compiler exclusions; it is
  not a third timing baseline. These artifacts are not the existing npm or
  dynamic demo build.
- Framework inputs are the existing demo ZIP archives. Restore writes the ZIP,
  extracts it through CGI `ZipArchive`, removes it, and completes persistence.
  Download is measured separately. The demo popup's CLI installer and progress
  interface are outside this measurement.
- Backend order alternates across rounds. Medians and p95 pool 60 warm requests
  per framework/backend; restore, first response, and restart medians use three
  independent trials. This is descriptive data, not a statistical confidence
  interval based on 60 independent browser instances.
- Native builds and compression were stopped during the measured trials. The
  suite paused between Laravel trials while a size-reference build ran, then
  resumed after that build finished and compression was paused.
- The first 18 trials required 90% CPU idle in a three-second preflight sample.
  Host activity later settled around 15–20%, with no visible native-build
  container. The remaining 18 trials used an explicitly recorded 80% minimum.
  No host-wide claim of zero background activity is made, and the preflight
  does not monitor activity throughout a trial. See [host observations](host-idle.jsonl)
  and the per-trial preflights in [summary JSON](summary.json).
- The adapter and timed operations stayed the same during the repeat. The
  runner gained checkpoint resumption and explicit preflight metadata when
  restarting after the pause. Retained trials were checked against current
  binary and archive hashes before reuse.
- The first response is from a freshly extracted archive. Warm requests reuse
  the worker and framework's generated caches. A persisted restart replaces
  the worker/runtime while retaining the browser profile. It does not simulate
  power loss or an OS cache reset.
- A real navigation was also checked, but its duration is auxiliary. Laravel's
  welcome page loads remote images; the local fetch comparisons do not include
  those image downloads.

The earlier PHP 8.4 pilots remain separately in `.cache/wasmfs-opfs/`. Archived
Laravel, CakePHP, and CodeIgniter dependencies exposed PHP 8.4 incompatibilities;
those responses are excluded. The valid comparison uses PHP 8.3, matching the
existing framework demos.

## Retained evidence

- [Verification](verification.json): all 36 trials complete, 720 valid warm
  requests, 180 matching static responses, archive entry counts, and native
  artifact hashes. All three Wasm artifacts also pass `WebAssembly.validate`.
- [Binary CGI probes](byte-probes.json): both backends preserve
  `00 01 7f 80 ff 0d 0a` exactly, including NUL, high bytes, and CRLF. These are
  separate untimed correctness checks.
- [Screenshots](screenshots/): the first round of every framework/backend.
  Rendered image state is retained in the trial JSON. Browser error records
  contain only the benchmark landing page's expected missing favicon.
- [Build inputs](build-inputs.json), [archive inputs](archive-inputs.json),
  [source hashes](source-inputs.json), and [artifact sizes](artifact-sizes.json)
  record the native profile, compiler image, source revision, and SHA-256s.

Matching JavaScript/Wasm pairs and ICU data remain under
`.cache/wasmfs-opfs/artifacts/{idbfs,opfs,idbfs-pruned}/packages/php-cgi-wasm/`.
Build and browser logs remain under `.cache/wasmfs-opfs/logs/`. Benchmark Chrome
profiles were removed and the local benchmark server was stopped. Production
filesystem settings and unrelated workspace changes were preserved.
