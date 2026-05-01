const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

/**
 * Returns the shared library definitions for this package build.
 * @param {object} php PHP runtime wrapper used to resolve version-specific assets.
 * @returns {Array<object>} Shared library definitions for the current package version.
 */
export const getLibs = php => [
	{name: `php8.5-sdl.so`, url: new URL(`./php8.5-sdl.so`, import.meta.url), ini}
	, {name: `libSDL2.so`, url: new URL(`./libSDL2.so`, import.meta.url)}
	, {name: `libGL.so`, url: new URL(`./libGL.so`, import.meta.url)}
];

export default {getLibs};
