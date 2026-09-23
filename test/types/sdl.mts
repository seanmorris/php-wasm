import { PhpSdl } from 'php-sdl-wasm/PhpSdl';
import type { PhpSdlOptions, PhpRuntimeFactory } from 'php-sdl-wasm/public';

const factory: PhpRuntimeFactory = async () => ({ HEAPU8: new Uint8Array(8) });
new PhpSdl({ runtime: factory, version: '8.4' });
new PhpSdl({ runtime: { default: factory }, version: '8.4' });
// @ts-expect-error Generic adapters require a matching native factory and version.
new PhpSdl();
// @ts-expect-error Factories must return runtime objects.
new PhpSdl({ runtime: () => 1, version: '8.4' });
const options: PhpSdlOptions = { canvas: document.createElement('canvas'), persist: false, ini: 'display_errors=1' };
// @ts-expect-error Packages select the runtime; variants are no longer supported.
const variant: PhpSdlOptions = { variant: '_sdl' };
// @ts-expect-error Versioned entries own the factory.
const override: PhpSdlOptions = { runtime: factory };
// @ts-expect-error The canvas must be a canvas object.
const canvas: PhpSdlOptions = { canvas: '#canvas' };
