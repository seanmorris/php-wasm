# CGI filesystem investigation — 2026-09-20

The subsequent [production IDBFS implementation and measurements](../2026-09-20-incremental-idbfs/README.md)
are recorded separately. This report preserves the earlier diagnostic results.

The 25 ms filesystem RPC batching window is restored in the production source,
with acknowledgments held until persistence completes. The storage and extraction
optimizations below remain diagnostic experiments. The original
[36-trial comparison](../2026-09-20/README.md) is unchanged.

## Why the wait disappeared

[6390db5](https://github.com/seanmorris/php-wasm/commit/6390db56fbd157feddcab92fc18c9bb2a0afa45b)
removed the five 5 ms queue polls while fixing an acknowledgment bug: callers
could observe success before the final persistence operation completed. The
wait itself was not the bug. The old queue also took the batch's read-only flag
from its first caller, which was unsafe for mixed read/write batches.

The restored queue hydrates once, executes queued callbacks serially, waits up
to 25 ms when idle, and commits once. Any write makes the batch writable. Every
acknowledgment waits for that commit; a failed commit rejects the entire batch.
Callback errors remain individual errors, with possible partial writes committed.
The queue yields between batches after 64 operations or a 250 ms processing
window, checked between callbacks. It does not interrupt an individual callback.
Manual transaction operations have no automatic batching delay.

This is the filesystem RPC queue, not the HTTP request path. HTTP CGI requests
still flush after each successful PHP request. The waiting transaction is the
wrapper's hydrate/flush lifecycle; an IndexedDB transaction is not held open
through the 25 ms wait. Sequentially awaited calls use separate batches because
their acknowledgments must follow persistence.

Eight concurrent Drupal `stat` calls on real IDBFS took **3.79–4.37 seconds** with
the previous per-call transactions, versus **0.49–0.54 seconds** with batching
across four comparisons. The counters confirm eight complete scans
became one. This measures restored batching as a whole, not the delay alone.

## Why OPFS restoration is slow

The existing PHP ZIP extractor writes in 8 KiB chunks. The pinned single-threaded
asynchronous OPFS adapter performs `createWritable({keepExistingData: true})`,
write, and close for each write. Reading the ZIP from OPFS also requires many
small asynchronous blob reads. See the pinned
[PHP extractor](https://github.com/php/php-src/blob/php-8.3.11/ext/zip/php_zip.c)
and [OPFS adapter](https://github.com/emscripten-core/emscripten/blob/6.0.6/src/lib/libwasmfs_opfs.js).

| Instrumented restore strategy | Drupal | WordPress |
| --- | ---: | ---: |
| ZIP in OPFS; ordinary `ZipArchive::extractTo` | 96.36 s | 72.19 s |
| ZIP in MEMFS; ordinary extraction | 60.80 s | Not measured |
| ZIP in MEMFS; one buffered write per file | 45.17 s; repeat 41.26 s | 9.87 s |

These are diagnostic trials, not replacements for the uninstrumented medians.
The ordinary IDBFS Drupal restores in these runs took roughly 4.6–5.1 seconds.
The candidate still pays substantial per-file OPFS overhead on Drupal.

The original Drupal extraction made **65,166 blob reads** (27.23 s of API wait)
and **19,499 writable-stream cycles**: create 21.86 s, write 9.64 s, close 8.09 s.
Keeping the archive in MEMFS removed the blob reads. Whole-file buffering cut
stream cycles to 14,936 and eliminated repeated preservation of partial files.
Handle lookups still took about 11 seconds in the buffered repeat.

WordPress makes the write problem especially clear. Its original extraction
made 14,280 stream cycles, including 10,659 writes of exactly 8 KiB.
`createWritable` alone took **42.79 seconds**, about 59% of the entire restore.
Buffering reduced cycles to 3,622 and stream creation to 2.44 seconds.

For only 64.95 MB of Drupal file writes and 95.94 MB of WordPress writes, repeated
`keepExistingData` requests covered cumulative existing lengths of 2.16 GB and
15.93 GB respectively. These are preservation requests, **not measured physical
disk copies**; Chromium may optimize the work internally.

The demonstrated extraction wins require no native build change. A general
solution needs bounded memory use for large files and preservation of extraction
semantics. Reworking the backend to retain handles or use synchronous worker
I/O is a separate design, not validated by this experiment.

## Why IDBFS is expensive

Every ordinary synchronization walks all **17,844** persisted Drupal entries
locally, then enumerates the remote timestamp index, then reconciles differences.
Typical warm requests spent 160–190 ms on the local traversal and 290–340 ms on
remote enumeration. The actual record writes took less than a millisecond.
Even no-op synchronization took about **0.45–0.58 seconds** without any writes.
This matches the pinned
[IDBFS implementation](https://github.com/emscripten-core/emscripten/blob/6.0.6/src/lib/libidbfs.js).

Drupal updates its files directory metadata while creating/removing SQLite
`-wal` and `-shm` sidecars. The wrapper also rewrites the 26-byte cookie snapshot.
The complete warm-request flush normally writes just one directory record and
that cookie file. Avoiding the cookie write alone would leave the expensive
`/persist` scan intact. Skipping entirely clean mounts also did not help Drupal:
both persistent mounts become dirty.

Two fresh-profile comparisons, six warm responses per strategy in each:

| Strategy | Median full response | Repeat | Persistence behavior |
| --- | ---: | ---: | --- |
| Ordinary IDBFS | 572.6 ms | 551.8 ms | Full local and remote scans |
| Flush dirty mounts only | 581.5 ms | 569.6 ms | Both mounts still dirty |
| Direct traversal of local MEMFS nodes | 372.5 ms | 410.5 ms | Cheaper local scan; remote scan remains |
| Journal changed paths, including deletions | 66.3 ms | 75.1 ms | Changed records only; about 1 ms to commit |

Direct traversal was checked against every path and timestamp returned by the
original traversal before activation. The first journal prototype fell back
to a full scan on every deletion, which Drupal's sidecars triggered on every
request. Adding deletion tracking removed that fallback for this workload.
Rename and symlink operations still fall back to full reconciliation.

The largest demonstrated IDBFS opportunity is avoiding full-tree discovery on
every request. A changed-path journal needs broader conformance before shipping:
multiple runtimes and hydration, all native mutation paths, renamed subtrees,
quota/abort retries, and recovery. The prototype waits for IndexedDB transaction
completion and retains dirty state on failure, but these trials do not prove
those broader cases. Nothing here removes the existing request-end durability
requirement or delays HTTP persistence until after a successful response.

## Evidence and scope

- [Raw trial records](trials/) and [summary](summary.json) keep timings,
  operation counts, observed paths, input hashes and validation results.
  Earlier harness setup failures are listed separately from successful trials.
- [Source inputs](source-inputs.json) retain the measured source snapshots for
  the final comparisons and the previous queue implementation. Early trials
  predate the expanded source/native input-hash capture; they remain identified
  separately. The final harness has subsequent formatting/JSDoc corrections.
- [Reproduction instructions](../../README.md#profile-the-bottlenecks) and the
  diagnostic worker/instrumentation describe the experimental changes.
- Same PHP 8.3.11, Emscripten 6.0.6, Chromium 147.0.7727.15 and native JS/Wasm
  pairs as the original experiment. No additional binary size cost from these
  extraction or IDBFS prototypes; see the original [artifact-size table](../2026-09-20/results.md).
  All nine retained native JS/Wasm/data artifacts still match their recorded
  hashes. The production ESM queue wrapper grows by 2,966 raw bytes, or 839 bytes
  with `gzip -n -9`; this is separate from the native artifact comparison.
- Timing runs were serial, without native compilation or compression alongside
  them. The diagnostic runner records load averages but does not enforce the
  earlier suite's CPU-idle preflight. Instrumentation overhead and host variation
  mean these measurements are descriptive, not statistical confidence bounds.
- Operation times may overlap. In particular, synchronous local traversal blocks
  IndexedDB callbacks for other mounts. Do not add every API duration together.
- Every successful run validated framework responses and a persisted worker
  restart. Later runs additionally hash the largest immutable source file,
  `index.php` and a static asset against the ZIP, before and after restart.
  Buffered extraction checks size and CRC for every decompressed file.
- IDBFS mutation probes cover native writes, truncation, metadata changes,
  rename/delete fallback, and four concurrent RPC writes. Exact binary contents
  and deleted-path absence are checked after restarting the worker.
- Recorded browser errors are the missing landing-page favicon and, for Drupal,
  a blocked cross-origin announcement request. No PHP fatal/parse response was
  accepted. These network errors are retained in the raw data.
- [Verification](verification.json) and [check logs](checks/) record 43 passing
  queue/concurrency/cookie/routing/lock tests, seven passing type checks with
  Deno 2.5.6, and 13 passing packaging/documentation tests, with no skips.
  Targeted sm-no-saccade-style/JSDoc lint passed without warnings. Package
  wrappers were regenerated through `make runtime-wrappers`.

The production queue, package README, root README, changelog, documentation-site
pages and vendored documentation fixtures were updated together. Native build
profiles, filesystem defaults and matching JS/Wasm artifacts remain unchanged.
The benchmark server was stopped and its temporary Chrome profiles removed.
