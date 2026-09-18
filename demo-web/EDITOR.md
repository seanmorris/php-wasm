The lightweight editor uses explicit Save. PHP and the debugger see only saved
files. Draft recovery is a separate IndexedDB store; it never writes an edit into
the live PHP filesystem. A browser crash can lose the last 500 ms of typing before
the next recovery snapshot. Recovery failures are shown in the status area.

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
