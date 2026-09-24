# CGI WasmFS/OPFS experiment

This benchmark compares the legacy MEMFS/IDBFS CGI filesystem with the pinned
Emscripten WasmFS OPFS backend. It builds **PHP 8.3.11 CGI only**, matching the
PHP minor version used by the existing demo archives. Production
filesystem defaults and existing demo assets are unchanged.

The retained [2026-09-20 results](results/2026-09-20/README.md) include the
comparison tables, individual measurements, input hashes, and screenshots.

The [follow-up investigation](results/2026-09-20-investigation/README.md) profiles
archive I/O and IDBFS synchronization, and measures restored filesystem RPC
batching. Its diagnostic timings are separate from the original comparison.
The [production IDBFS results](results/2026-09-20-incremental-idbfs/README.md)
record the implemented journal and fresh paired framework measurements.
The [read-side follow-up](results/2026-09-20-idbfs-read-investigation/README.md)
records why the bulk timestamp-enumeration prototype was not adopted.

The control and candidate use the same PHP tree, static extension set, native
library archives, compiler image, optimization level, and Asyncify settings.
The profile starts from `.github/.env_8.3.static.ci`, disables SDL and waitline,
and enables the existing VRZNO and PDO-PGlite extensions. It is a static CGI
experiment; artifact sizes are not those of the demo's dynamic build or npm
package. The complete Make profile and archive hashes are recorded in
`build-inputs.json`.
`ASYNCIFY_REMOVE` is empty in both: OPFS can suspend while PHP opens source
files, so excluding the compiler is not valid for this candidate. Both use a
128 KiB Asyncify stack. This control isolates the filesystem change; it is not
a comparison against an older prebuilt npm runtime.

The single-threaded CGI service worker uses Emscripten's asynchronous OPFS
backend. This does not measure a pthread or dedicated-worker synchronous OPFS
design. It retains Asyncify; it does not switch to JSPI.

## Reproduce

The existing `/app` checkout must have its PHP 8.3 source, native library
archives, ICU data, demo zip archives, node dependencies, and pinned builder
image available, plus `unzip` to validate static assets against the archives.
Preparation copies those fixed inputs into an isolated build
directory, preserving symlinks and timestamps. No Git worktree is created.

```sh
node test/perf/wasmfs-opfs/prepare.mjs
node test/perf/wasmfs-opfs/build.mjs idbfs
node test/perf/wasmfs-opfs/build.mjs opfs
node test/perf/wasmfs-opfs/server.mjs
```

After compilation finishes, run the browser trials serially, starting with
Drupal. Use the same internal Chromium executable for both variants:

```sh
node test/perf/wasmfs-opfs/run.mjs idbfs drupal
node test/perf/wasmfs-opfs/run.mjs opfs drupal
node test/perf/wasmfs-opfs/run.mjs idbfs wordpress,laravel-11,cakephp-5,codeigniter-4,laminas-3
node test/perf/wasmfs-opfs/run.mjs opfs wordpress,laravel-11,cakephp-5,codeigniter-4,laminas-3
node test/perf/wasmfs-opfs/report.mjs
```

For a clean repeat, let native builds and artifact compression finish, then run:

```sh
node test/perf/wasmfs-opfs/repeat.mjs
BENCH_OUTPUT_DIR=.cache/wasmfs-opfs/clean-repeat node test/perf/wasmfs-opfs/report.mjs
```

The repeat suite retains the first-run data, alternates backend order across
three fresh-profile rounds, and checks host CPU idleness and known build
containers before each trial. Its observations are saved in `host-idle.jsonl`.
It defaults to at least 90% CPU idle over three seconds before each trial; this
does not monitor or guarantee host idleness throughout the trial. Compression
happens separately from timing runs. `BENCH_MIN_IDLE_PERCENT` can set a different
threshold for a host with ongoing background activity; the chosen threshold
and observed idle percentage are recorded with each new trial.

To resume an interrupted suite, use `BENCH_RESUME=1`. Complete trials are
retained only when their source version, input hashes, and sample counts match.
Incomplete records are saved before retrying them. Existing trial records are
otherwise protected from being overwritten by the repeat driver.

After timing trials finish, an optional size reference isolates the additional
cost of expanding Asyncify beyond the usual compiler exclusions:

```sh
node test/perf/wasmfs-opfs/build.mjs idbfs-pruned
BENCH_OUTPUT_DIR=.cache/wasmfs-opfs/clean-repeat node test/perf/wasmfs-opfs/report.mjs
```

The report shows both the filesystem-only delta and the combined cost of OPFS
plus expanded Asyncify. All three builds retain the same extension set and
128 KiB Asyncify stack. The reference is not an older npm artifact.

`BENCH_ROUNDS` defaults to 3 fresh persistent profiles per framework/backend;
`BENCH_SAMPLES` defaults to 20 warm requests per trial. `BENCH_OUTPUT_DIR` can
keep pilot runs separate. `BENCH_PROBE=1` checks exact binary CGI output before
restoring an archive. The benchmark owns and removes its Chrome profiles after
closing them. It does not use incognito storage for performance measurements.

## Measurements

- Worker ready: service-worker registration, module load, native startup, and
  empty filesystem mount/hydration. Native startup phases are also saved.
- Restore: write the existing demo zip, persist it, extract each entry through
  PHP `ZipArchive`, remove the zip, and complete persistence. Local download is
  recorded separately. Both variants restore through CGI; this is not a timing
  of the demo popup's separate CLI installer or its progress UI.
- First framework response and 20 warm responses: browser fetch through the
  actual CGI service worker, including response body consumption and persistence.
  Every response must be HTTP 200, contain the expected framework text, and
  have no PHP fatal/parse errors. Static response bytes must match the archive.
- Static asset: five uncached service-worker file responses. A real navigation
  also checks rendered text and records a screenshot and image state.
- Persisted restart: stop the service worker, create a new native runtime,
  hydrate or remount the existing files, and validate another framework request.
  This is a worker restart within the same persistent browser profile.
- Files: matching JavaScript/Wasm pairs and ICU data are retained; the report
  records raw, timestamp-free gzip level 9, and Brotli level 11 sizes plus SHA-256.

Raw per-trial JSON, failures, screenshots, build inputs, logs, CSV and Markdown
tables live in `.cache/wasmfs-opfs/`. Failed trials never count as fast results.
Medians and nearest-rank p95 values are computed from retained measurements.
Warm medians and p95 pool the 60 requests per framework/backend; startup,
restore, first response, and restart medians use the three independent trials.
Browser navigation time is auxiliary: Laravel's welcome page also loads remote
images. The local fetch timings in the comparison table exclude those images.
The discarded PHP 8.4 pilots exposed old Carbon, Chronos, and CodeIgniter date
API incompatibilities in the demo archives; those errors are not FS timings.

## CGI adaptation

Only the benchmark's served copy of `PhpCgiBase` awaits filesystem operations
in request routing. Both variants use the same native filesystem bridge and
the same original request/response parser, environment setup, cookie handling,
and request lock. The original Emscripten `FS` object remains intact.

The candidate mounts OPFS at `/opfs` and aliases its persistent subdirectories
to `/persist` and `/config`. Byte-oriented devices replace WasmFS's default
line-oriented stdout/stderr so CGI headers and binary bodies remain intact.
The control retains IDBFS hydration and request-end synchronization. OPFS writes
complete through its native backend; it does not emulate IDBFS `syncfs`.

## Profile the bottlenecks

With the same built artifacts and benchmark server available, run diagnostics
serially, with no builds or compression running alongside them:

```sh
node test/perf/wasmfs-opfs/diagnose.mjs idbfs drupal original
node test/perf/wasmfs-opfs/diagnose.mjs opfs drupal original
node test/perf/wasmfs-opfs/diagnose.mjs opfs drupal memory-archive
node test/perf/wasmfs-opfs/diagnose.mjs opfs drupal buffer-files
node test/perf/wasmfs-opfs/diagnose.mjs opfs wordpress original
node test/perf/wasmfs-opfs/diagnose.mjs opfs wordpress buffer-files
node test/perf/wasmfs-opfs/diagnose.mjs idbfs drupal incremental-idbfs
```

Use `BENCH_FIRST_ROUND=1` (or another unused number) to repeat without overwriting
evidence. The runner saves checkpoints under `.cache/wasmfs-opfs/diagnostics/`.
It requires Python 3 and `unzip` to select and hash archive members. Each run
checks the framework response, selected source/static bytes, and persistence
after a worker restart. Whole-file extraction also checks each entry's size
and CRC before writing. It buffers the largest file in memory, so it is an
experiment for these known archives, not a general-purpose extraction change.

OPFS instrumentation counts browser handle lookups, blob reads and writable
stream operations. `memory-archive` puts only the temporary ZIP in MEMFS;
`buffer-files` additionally decompresses and writes each file in one call.
No native binary is rebuilt between strategies.

IDBFS diagnostics measure local traversal, remote timestamp enumeration and
actual writes separately. They compare the previous CGI queue from the recorded
build revision against the current source using eight concurrent reads. They
then try dirty-mount filtering, direct local-node traversal, and changed-path
commits in that order, with six requests per strategy. These latter three are
test-only experiments; the changed-path journal falls back to full reconciliation
on rename or symlink operations. Mutation probes cover creation, native writes,
truncation, metadata changes, rename, deletion and four batched RPC writes.
They do not establish multi-runtime, quota/abort or crash recovery correctness.

`incremental-idbfs` instead enables the production `source/idbfsSync.mjs` helper
before restore and omits those three diagnostic-only strategies. It retains
the same CGI adapter, archives and native binaries, and records the helper's
source hash. The browser conformance suite in `test/browser/idbfs.spec.mjs`
separately exercises production wrappers, native writes, aborted commits,
quota failures, independent runtimes and compatibility with unmodified IDBFS.

Instrumentation adds overhead. Compare strategy timings within these runs;
retain the original repeat suite as the uninstrumented baseline. API durations
can overlap, especially when a synchronous local traversal blocks IndexedDB
callbacks, so they must not all be added together. `preservedBytes` is the sum
of existing file lengths passed to `createWritable({keepExistingData: true})`,
not measured disk traffic. Load averages are recorded; the diagnostic runner
does not enforce the repeat suite's CPU-idle preflight.
