# Production CGI incremental IDBFS — 2026-09-20

Browser CGI now tracks filesystem mutations and commits only changed IDBFS
records. The request still waits for persistence before returning success.
This implements the main finding from the [diagnostic investigation](../2026-09-20-investigation/README.md)
in the production wrapper, with native browser conformance tests.

See the [paired performance tables](results.md), [CSV](results.csv),
[summary and trial index](summary.json), and [raw trials](trials/).

## Results

Fresh paired comparisons measured six warm requests per configuration using
the same PHP 8.3.11 JS/Wasm pair and existing archives:

| Framework | Ordinary IDBFS | Production helper | Reduction |
| --- | ---: | ---: | ---: |
| Drupal | 539.7 ms | 68.6 ms | 87.3% |
| WordPress | 849.7 ms | 730.3 ms | 14.0% |
| Laravel 11 | 476.2 ms | 257.0 ms | 46.0% |
| CakePHP 5 | 468.5 ms | 218.8 ms | 53.3% |
| CodeIgniter 4 | 94.0 ms | 66.9 ms | 28.8% |
| Laminas 3 | 278.1 ms | 89.0 ms | 68.0% |

An earlier independent production run of each framework gave similar warm
medians (also in the tables); Drupal has an additional repeat. All **19 trials**
completed, checked framework responses, compared selected source/static bytes
with the archive, and checked those bytes again after a worker restart.

Persistence typically fell below 1.1 ms. CakePHP still writes its roughly 2 MB
debug SQLite database each request, with a 17.7 ms median flush in the paired
trial. WordPress now spends most of its response time executing PHP. Archive
restore remains broadly similar; this change removes scans after warm requests.

These are instrumented localhost diagnostics, not confidence intervals. Warm
samples within a profile are not independent browsers. Timing runs were serial,
without builds, compression or test suites alongside them. Load averages were
recorded, without enforcing a CPU-idle threshold. Controls execute additional
experimental phases after the compared warm samples; subsequent restart times
use differently warmed data and are retained for correctness, not compared here.

## Implementation and correctness

- Native node/stream hooks cover PHP writes, truncation, metadata, memory-map
  synchronization, renames, symlinks and deletions. Renamed trees use subtree
  removals and replacement records in the same per-mount transaction. Writes
  through an unlinked or overwritten descriptor cannot resurrect its old path.
- Journal entries clear only after `transaction.oncomplete`. Aborted and quota
  failures retain changes. A subsequent hydration retries the failed commit
  before loading remote data. Mutations arriving during a commit stay pending.
- The existing `FILE_DATA` schema and record shape are unchanged. Independent
  runtimes can save unrelated paths without deleting each other's records;
  hydration still reconciles remote storage. Unmodified IDBFS was tested reading
  and writing the same database.
- Local reconciliation walks MEMFS nodes directly. Nested mounts retain ordinary
  reconciliation, verified across mount/unmount. The first synchronization
  establishes a full baseline even if files predate installation of the helper.
- Symlink hydration applies metadata to the link itself. This fixes errors for
  missing or later-restored targets and avoids changing target permissions.
- The restored 25 ms RPC batching window remains. HTTP requests still flush
  individually. Other backends and native build profiles are unchanged.

The helper uses Emscripten's IDBFS/MEMFS interfaces and is tested against the
pinned build. Mutations should use PHP or filesystem APIs; directly changing
internal node objects or backing buffers is outside that contract. The wrapper's
Web Lock still provides serialization. Worker restart tests do not establish
browser/OS crash or power-loss durability.

## Verification and size

The [browser suite](../../../../browser/idbfs.spec.mjs) covers eleven persistence
cases on every locally available PHP version from 8.0 through 8.5 (66 passing
cases, using the static dependency profile). Three existing service-worker regressions also verify
concurrent PHP/RPC writes, fresh iframe content and cookies across refreshes.
The suite is included in `test/browser-test.sh` for the existing browser CI
matrix. These are local results; no remote CI run is claimed.
The harness forwards the library profile and uses the existing shared-library
resolver so CI can exercise its shared and dynamic builds as well.

Fast checks pass: 56 queue/concurrency/cookie/routing/lock/packaging/docs tests,
seven type checks including Deno 2.5.6, and targeted style/JSDoc lint. Package
wrappers were regenerated through `make runtime-wrappers`.
The [verification manifest](verification.json) links the retained check logs.

The [read-side investigation](../2026-09-20-idbfs-read-investigation/README.md)
tested a schema-compatible bulk timestamp scan. It was slower on the five
larger trees, so production retains the existing remote cursor for hydration.

[Artifact sizes](artifact-sizes.json) verify that all nine retained native
JS/Wasm/data files match the original hashes. Beyond the restored queue, the
helper and its import add **11,325 raw bytes** or **3,876 gzip-9 bytes**, compressing
modules separately with `gzip -n -9`. No native rebuild or migration was needed.
Including the restored batching queue, the complete wrapper change adds
**14,291 raw bytes** or **4,715 gzip-9 bytes** relative to commit `44e06ef`.

[Source snapshots](source-inputs.json) identify the measured code. The
[reproduction instructions](../../README.md#profile-the-bottlenecks) describe
`diagnose.mjs idbfs <framework> incremental-idbfs`. Recorded browser errors retain
the missing favicon and Drupal's blocked announcement request; PHP fatal/parse
responses are rejected. Existing evidence and unrelated workspace edits remain.
