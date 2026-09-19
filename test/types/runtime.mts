import { PhpBase } from 'php-wasm/PhpBase';
import { PhpNode } from 'php-wasm/PhpNode.mjs';
import { PhpWeb } from 'php-wasm/PhpWeb';
import { PhpCliNode } from 'php-cli-wasm';
import { PhpCliWeb } from 'php-cli-wasm/PhpCliWeb.mjs';
import { PhpCgiNode } from 'php-cgi-wasm';
import type { PhpCgiRuntimeArgs, PhpCgiBase as RootCgiBase } from 'php-cgi-wasm';
import { PhpCgiBase } from 'php-cgi-wasm/PhpCgiBase';
import { PhpCgiWebBase } from 'php-cgi-wasm/PhpCgiWebBase';
import { PhpDbgNode } from 'php-dbg-wasm';
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';
import type { PhpBinaryRuntime, PhpRuntimeArgs, PhpRuntimeFactory, PhpFileNode } from 'php-wasm/public';
import type { PhpBase as PublicBase } from 'php-wasm/public';

const runtime: PhpBinaryRuntime = { HEAPU8: new Uint8Array(8) };
const syncFactory: PhpRuntimeFactory = (_args: PhpRuntimeArgs) => runtime;
const asyncFactory: PhpRuntimeFactory = async (_args: PhpRuntimeArgs) => runtime;
class Runtime { HEAPU8 = new Uint8Array(8); constructor(_args: PhpRuntimeArgs) {} }
for (const factory of [syncFactory, asyncFactory, Runtime]) {
	new PhpBase(Promise.resolve(factory));
	new PhpBase(Promise.resolve({ default: factory }));
	new PhpCgiBase(Promise.resolve({ default: factory }));
	new PhpCgiWebBase(Promise.resolve({ default: factory }));
}
// @ts-expect-error The loader must resolve to a factory, not a module instance.
new PhpBase(Promise.resolve(runtime));
// @ts-expect-error Factories must return a runtime object.
new PhpBase(Promise.resolve(() => 123));
// @ts-expect-error CGI loaders still require the module namespace.
new PhpCgiBase(Promise.resolve(syncFactory));
// @ts-expect-error The heap is an unsigned byte array.
const signedHeap: PhpBinaryRuntime = { HEAPU8: new Int8Array(8) };

const embedded = new PhpNode({ version: '8.5', persist: false, shared: { callback() {} } });
const status: Promise<number> = embedded.run('<?php echo 1;');
const publicInstance: PublicBase = embedded;
const refreshed: Promise<number> = embedded.refresh();
const browserRefresh: Promise<void> = new PhpWeb().refresh();
const tokens: Promise<string> = embedded.tokenize('<?php echo 1;');
const directory: Promise<PhpFileNode> = embedded.mkdir('/example');
const bytes: Promise<Uint8Array> = embedded.readFile('/example/a');
const text: Promise<string> = embedded.readFile('/example/a', { encoding: 'utf8' });
embedded.writeFile('/example/a', new DataView(new ArrayBuffer(8)));
// @ts-expect-error Tokenization is asynchronous.
const syncTokens: string[] = embedded.tokenize('<?php echo 1;');
// @ts-expect-error mkdir returns node metadata.
const voidDirectory: Promise<void> = embedded.mkdir('/example');
// @ts-expect-error An embedded runtime requires PHP source, not CLI flags.
embedded.run(['-v']);
// @ts-expect-error Emscripten FS accepts strings and ArrayBuffer views.
embedded.writeFile('/example/a', new ArrayBuffer(8));

for (const cli of [new PhpCliNode(), new PhpCliWeb()]) {
	const exit: Promise<number | undefined> = cli.run(['-r', 'echo 1;']);
	cli.run();
	const tokenText: Promise<string> = cli.tokenize('<?php echo 1;');
	// @ts-expect-error CLI run accepts a flag array.
	cli.run('<?php echo 1;');
	// @ts-expect-error Every CLI flag must be a string.
	cli.run([1]);
}
const browserCliExit: Promise<number> = new PhpCliWeb().run();
// @ts-expect-error Node CLI can resolve undefined when an error has no exit status.
const nodeCliExit: Promise<number> = new PhpCliNode().run();
const cgiArgs: PhpCgiRuntimeArgs = { docroot: '/www' };
const cgi = new PhpCgiNode(cgiArgs);
for (const filesystem of [embedded, cgi, new PhpCliNode(), new PhpDbgWeb()]) {
	const names: Promise<string[]> = filesystem.readdir('/persist');
	const legacy: Promise<string[]> = filesystem.readdir('/persist', { withFileTypes: false });
	const entries: Promise<Array<{ name: string; isFolder: boolean }>> = filesystem.readdir('/persist', { withFileTypes: true });
	const optional: Promise<string[] | Array<{ name: string; isFolder: boolean }>> = filesystem.readdir('/persist', { withFileTypes: Math.random() > 0.5 });
	// @ts-expect-error Typed listings resolve entries, not names.
	const wrongNames: Promise<string[]> = filesystem.readdir('/persist', { withFileTypes: true });
	// @ts-expect-error Legacy listings still resolve names.
	const wrongEntries: Promise<Array<{ name: string; isFolder: boolean }>> = filesystem.readdir('/persist');
	// @ts-expect-error The option is a boolean, not a string.
	filesystem.readdir('/persist', { withFileTypes: 'true' });
}
const rootCgiBase: RootCgiBase = cgi;
const response: Promise<Response | string | undefined> = cgi.request(new Request('https://example.com/'));
const cgiRuntime: Promise<PhpBinaryRuntime> = cgi.refresh();
const putenv: Promise<number> = cgi.putEnv('APP_ENV', 'test');
// @ts-expect-error CGI does not extend EventTarget.
cgi.addEventListener('ready', () => {});
// @ts-expect-error CGI refresh returns the new binary.
const emptyRefresh: Promise<void> = cgi.refresh();

for (const dbg of [new PhpDbgNode(), new PhpDbgWeb()]) {
	const exit: Promise<number> = dbg.run();
	const running: Promise<number> = dbg.isRunning();
	const files: Promise<string[]> = dbg.dumpFiles();
	const frames: Promise<Array<{filename: string; lineNo: number; frame: number}>> = dbg.dumpBacktrace();
	const symbols: object = dbg.dumpSymbols(0, runtime);
	// @ts-expect-error No symbol table is returned when its native pointer is zero.
	const locals: Promise<object> = dbg.dumpVars();
	// @ts-expect-error Debugger run takes no PHP source argument.
	dbg.run('<?php echo 1;');
}

// The duplicated contracts stay package-local, but must remain identical.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type CliArgs = Assert<Equal<PhpRuntimeArgs, import('php-cli-wasm/public').PhpRuntimeArgs>>;
type DbgArgs = Assert<Equal<PhpRuntimeArgs, import('php-dbg-wasm/public').PhpRuntimeArgs>>;
type CloudArgs = Assert<Equal<PhpRuntimeArgs, import('php-cloud-wasm/public').PhpRuntimeArgs>>;
type CgiBinary = Assert<Equal<PhpBinaryRuntime, import('php-cgi-wasm/public').PhpBinaryRuntime>>;
type CliBase = Assert<Equal<PhpBase, import('php-cli-wasm/PhpBase').PhpBase>>;
type DbgBase = Assert<Equal<PhpBase, import('php-dbg-wasm/PhpBase').PhpBase>>;
type CloudBase = Assert<Equal<PhpBase, import('php-cloud-wasm/PhpBase').PhpBase>>;
type FilesystemMethods = 'analyzePath' | 'readdir' | 'readFile' | 'stat' | 'mkdir' | 'rmdir' | 'rename' | 'writeFile' | 'unlink';
type CgiFilesystem = Assert<Equal<Pick<PhpBase, FilesystemMethods>, Pick<PhpCgiBase, FilesystemMethods>>>;

type CliConstructor = Assert<Equal<typeof PhpBase, typeof import('php-cli-wasm/PhpBase').PhpBase>>;
type DbgConstructor = Assert<Equal<typeof PhpBase, typeof import('php-dbg-wasm/PhpBase').PhpBase>>;
type CloudConstructor = Assert<Equal<typeof PhpBase, typeof import('php-cloud-wasm/PhpBase').PhpBase>>;
