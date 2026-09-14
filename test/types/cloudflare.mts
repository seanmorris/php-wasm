import { PhpCloudflare } from 'php-cloud-wasm/PhpCloudflare';
import type { PhpCloudflareOptions, PhpRuntimeFactory } from 'php-cloud-wasm/public';

const factory: PhpRuntimeFactory = async () => ({ HEAPU8: new Uint8Array(8) });
const wasmModule = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
new PhpCloudflare({ runtime: factory, wasmModule, version: '8.4', cfd1: { DB: {} } });
new PhpCloudflare({ runtime: { default: factory }, wasmModule, version: '8.4' });
// @ts-expect-error Generic adapters require the factory, compiled Wasm and version.
new PhpCloudflare();
// @ts-expect-error A compiled Wasm module is required.
new PhpCloudflare({ runtime: factory, wasmModule: null, version: '8.4' });
// @ts-expect-error A runtime factory cannot return a number.
new PhpCloudflare({ runtime: () => 1, wasmModule, version: '8.4' });

const options: PhpCloudflareOptions = { persist: false, cfd1: { DB: {} }, shared: { answer: 42 } };
// @ts-expect-error Persistent filesystems are unavailable.
const persistent: PhpCloudflareOptions = { persist: true };
// @ts-expect-error Shared libraries must be statically compiled.
const shared: PhpCloudflareOptions = { sharedLibs: [] };
// @ts-expect-error Dynamic libraries must be statically compiled.
const dynamic: PhpCloudflareOptions = { dynamicLibs: [] };
// @ts-expect-error Emscripten dynamic libraries are also unsupported.
const libraries: PhpCloudflareOptions = { dynamicLibraries: [] };
// @ts-expect-error The adapter owns instantiation.
const instantiate: PhpCloudflareOptions = { instantiateWasm() {} };
// @ts-expect-error The adapter owns the Wasm input.
const binary: PhpCloudflareOptions = { wasmBinary: new Uint8Array(8) };
// @ts-expect-error Cloudflare has no SDL variant.
const variant: PhpCloudflareOptions = { variant: '_sdl' };
// @ts-expect-error Versioned entrypoints own the factory.
const runtime: PhpCloudflareOptions = { runtime: factory };
// @ts-expect-error Versioned entrypoints own the Wasm module.
const wasm: PhpCloudflareOptions = { wasmModule };
// @ts-expect-error Versioned entrypoints own the PHP version.
const version: PhpCloudflareOptions = { version: '8.4' };
