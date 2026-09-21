Vendored docs fixture from `seanmorris/php-wasm-site`.

- Commit: `eec9df8786a76525f3a07eaf85e597b3e8e57ff9`

The markdown files under `pages/` are based on that commit and include inline HTML comments
linking back to the source repo plus the php-wasm code the local docs harness validates against.

The SDL guide and its related build, constructor, extension, demo, and changelog
pages match the committed SDL documentation update. Their provenance comments
identify the source revision; the setup example was also exercised in Chromium
against the PHP 8.4 static SDL runtime.

`pages/filesystem/transactions.md` and `pages/methods/php-cgi-wasm.md` also include
the matching local documentation update for restored browser CGI filesystem
batching and incremental IDBFS commits. Their provenance comments identify this
working-tree update.

GitHub: https://github.com/seanmorris/php-wasm-site
