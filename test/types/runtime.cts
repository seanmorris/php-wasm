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
const cgiArgs: cgi.PhpCgiRuntimeArgs = { docroot: '/www' };
const cgiBase: cgi.PhpCgiBase = new cgi.PhpCgiNode(cgiArgs);
cgiBase.request(new Request('https://example.com/'));
for (const filesystem of [php, cgiBase, new cli.PhpCliNode(), new dbg.PhpDbgNode()]) {
	const names: Promise<string[]> = filesystem.readdir('/persist');
	const entries: Promise<Array<{ name: string; isFolder: boolean }>> = filesystem.readdir('/persist', { withFileTypes: true });
	// @ts-expect-error CommonJS has the same typed listing contract.
	const wrong: Promise<string[]> = filesystem.readdir('/persist', { withFileTypes: true });
}
// @ts-expect-error The root exports the base type; its constructor has its own entrypoint.
new cgi.PhpCgiBase(Promise.resolve({ default: () => ({}) }));
new dbg.PhpDbgNode().run();
// @ts-expect-error CLI accepts flags in CommonJS too.
new cli.PhpCliNode().run('<?php echo 1;');
// @ts-expect-error The declaration must expose a typed constructor, not any.
new cgi.PhpCgiNode({ version: '9.0' });
