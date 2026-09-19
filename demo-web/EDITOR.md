The lightweight editor uses explicit Save. PHP and the debugger see only saved
files. Draft recovery is a separate IndexedDB store; it never writes an edit into
the live PHP filesystem. A browser crash can lose the last 500 ms of typing before
the next recovery snapshot. Recovery failures are shown in the status area.

An empty workspace opens a saveable untitled document. Closing or deleting the
last tab creates another untitled document; Save prompts for its destination.
Opening `code-editor.html` without a `path` starts this way. A `path` query
parameter identifies a file to open, such as `/persist/example.php`.

File commands support untitled buffers, New File/Folder, Open by path, Save As,
Save All, Revert, rename, move, duplicate, copy/cut/paste, multiple selection,
recursive deletion and drag/drop. Destructive commands compare the revision the
user saw while holding the filesystem lock. Existing destinations require a
decision. Save failures retain the buffer and dirty indicator; a successful save
only marks the bytes actually written as saved, even if typing continued.

Close and navigation offer Save/Discard/Cancel. Starting the debugger requires
saving changed files. Moves remap open tabs and breakpoints. Deletion closes the
affected tabs after confirmation. Refresh and window focus detect external
changes; editor operations also notify other windows. Changed files offer Reload,
Save As, or an explicit overwrite when saving. No conflict silently replaces a
dirty buffer.

Quick open searches filenames below the explorer root and includes recent files.
The tree loads expanded folders on demand, with folders first. Filtering applies
to visible filenames. Breadcrumbs, Root and Reveal help navigate large trees.
Tabs show full paths when names collide and support arrow keys, Home and End.
The explorer has keyboard navigation, selection checkboxes, action buttons and a
width control; it can be hidden on small screens. Dialogs trap and restore focus.

Shortcuts: Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves all, Ctrl/Cmd+O opens a path,
Ctrl/Cmd+P opens Quick open, Ctrl/Cmd+N creates an untitled buffer, Ctrl/Cmd+W closes
the current tab, and Ctrl/Cmd+Shift+T reopens the last closed path. Browser/OS
shortcuts may take precedence.

Text editing supports UTF-8, retaining a BOM and LF/CRLF line endings. Other
encodings and binary data open read-only with an exact-byte download; supported
images have a preview. Files larger than 2 MiB require confirmation. Only
`/persist` and `/config` survive worker restarts. Browser storage remains subject
to the site's quota and browser eviction; Download/Export provide portable copies.

Uploads preserve bytes and folder paths. ZIP import/export lazily starts an
isolated CGI worker using the demo's existing PHP ZipArchive runtime. Its
temporary filesystem is not mounted in IndexedDB. A ZIP is fully inventoried and
decompressed there before import into the chosen destination. Absolute/traversing
paths, symlinks, special entries, duplicate paths and file/folder collisions are
rejected. Limits are 64 MiB compressed, 256 MiB expanded and 50,000 entries; ZIPs
cannot be imported at `/`. Ordinary upload batches share the expanded-size and
entry limits. Collision choices and partial completion counts remain visible.
Empty ZIPs and empty folders are supported.

Read-only requests time out after 30 seconds and can be retried. A slow mutation
keeps its original request alive and displays an unknown-outcome message after
15 seconds; it is never automatically replayed. Keep the page open for a late
reply. If the controlling worker changes, preserve/download drafts and reconcile
the filesystem on refresh or reload before another mutation. Downloading the
current buffer remains available during a pending write. Reload recovery keeps
the previous saved revision so another Save checks for a conflict.

Recovery snapshots are scoped to the origin/base path and browser session, with
distinct records for each mounted editor so cloned windows cannot overwrite one
another's drafts. A recovered record is retained as a backup; explicit discard
removes that selected recovery record. “Later” retains a reference for the next
reload. Saved/closed documents stop contributing text to the current snapshot.
An explicit URL path takes precedence over the restored active tab.

`npm test` in `demo-web` covers the model, filesystem operations, transfers,
recovery and UI. `node --test test/php-cgi-queue.test.mjs` checks durable operation
acknowledgments and queue recovery. Both run in the fast CI gate, with source
wrappers staged by `make runtime-wrappers`. `make test-demo-web` also runs the
built-browser editor suite against each static/shared/dynamic demo artifact.
No new native builds are needed for local wrapper changes; regenerate wrappers
and rebuild the demo before testing it.

The separate VS Code example at `vscode.html` uses `vscode-react` and File Bus.
Its directory expansion and recursive file search request
`readdir(path, {withFileTypes: true})`, so a compatible CGI worker returns names
and folder types in one read-only transaction. File Bus falls back to
`analyzePath` for hosts that return strings. Listings are not cached; filesystem
errors propagate, and writes still wait for persistence before acknowledgment.
The lightweight editor keeps its existing dedicated filesystem actions.

The VS Code page starts PHP readiness and prepares its debug files while the
iframe loads. It waits for both before configuring the editor and opening the
requested file. React development-mode effect replay does not repeat debug-file
setup or enqueue duplicate directory creation requests.

The framework chooser, installer and VS Code bridge check PHP readiness before
using the shared CGI runtime. Registration, replacement and PHP readiness
failures get two automatic retries, after 1 and 2 seconds, with progress shown
while retrying. Each readiness check gets 15 seconds to reply. Replacement has
its own 15-second deadline, including waiting for another tab's recovery.
Concurrent callers share startup, and tabs reuse a replacement already installed
by another tab. Recovery preserves `/persist` and `/config`; it does not clear
browser storage. The chooser and installer show a startup error with **Retry PHP
startup** only after all three attempts fail. Installation operations are never
replayed by this recovery path; the installer only offers that retry before
installation begins.

The generated CGI entry stays at `cgi-worker.js`. Its hashed JavaScript and native
dependencies live in `worker-assets/`, without `node_modules` path segments that
Vite's file watcher ignores when a rebuild adds new hashes. Rebuild
with `npm run build:worker` after changing worker sources or installed packages.

The host bridge must forward the options argument. `vscode-react` 0.2.2 already
does this; updating its package is not needed. The VS Code host must contain a
rebuilt File Bus extension as well as the updated PHP demo worker. In the host
checkout, run `npm ci` and `npm run compile` in `extra_extensions/file-bus`, then
`make all` at the host root. This stages the extension and regenerates the host
page; publishing that host is a separate step. For local testing, the demo accepts
`vscode.html?vscodeUrl=http://127.0.0.1:9416/`.

`node --test test/filesystem.test.mjs` checks constant refresh counts for 100 and
1,000 entries, transaction ownership, failures, and write sequencing. File Bus's
`npm test` covers directory expansion, recursive search and legacy hosts. The
built-browser editor suite checks native listing types and persisted mutations.
