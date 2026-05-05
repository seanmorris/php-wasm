/**
 * Compatibility shim for historical `php-wasm-sdl` imports.
 * SDL support now lives in the `_sdl` runtime variant and does not require extra shared libraries.
 *
 * @returns {Array<object>} Always returns an empty list.
 */
export const getLibs = () => [];

export default {getLibs};
