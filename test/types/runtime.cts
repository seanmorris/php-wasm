import embedded = require('php-wasm/PhpNode');
import base = require('php-wasm/PhpBase.js');
import cli = require('php-cli-wasm');
import cgi = require('php-cgi-wasm');
import dbg = require('php-dbg-wasm');

const php = new embedded.PhpNode();
const status: Promise<number> = php.run('<?php echo 1;');
const tokens: Promise<string> = php.tokenize('<?php echo 1;');
new base.PhpBase(Promise.resolve(async () => ({ HEAPU8: new Uint8Array(8) })));
new cli.PhpCliNode().run(['-v']);
new cgi.PhpCgiNode().request(new Request('https://example.com/'));
new dbg.PhpDbgNode().run();
// @ts-expect-error CLI accepts flags in CommonJS too.
new cli.PhpCliNode().run('<?php echo 1;');
// @ts-expect-error The declaration must expose a typed constructor, not any.
new cgi.PhpCgiNode({ version: '9.0' });
