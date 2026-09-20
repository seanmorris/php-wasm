Vendored docs fixture from `seanmorris/php-wasm-site`.

- Commit: `bdf1555ad207242ac09292ff05b125f006a9d049`

The markdown files under `pages/` are copied from that commit and include inline HTML comments
linking back to the source repo plus the php-wasm code the local docs harness validates against.

`pages/filesystem/transactions.md` and `pages/methods/php-cgi-wasm.md` also include
the matching local documentation update for restored browser CGI filesystem
batching and incremental IDBFS commits. Their provenance comments identify this
working-tree update.

GitHub: https://github.com/seanmorris/php-wasm-site
