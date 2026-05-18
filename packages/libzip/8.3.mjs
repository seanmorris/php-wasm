const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

/**
 * Returns the shared library definitions for this package build.
 * @returns {Array<object>} Shared library definitions for the current package version.
 */
export const getLibs = () => [
	{name: 'php8.3-zip.so', url: new URL('./php8.3-zip.so', import.meta.url), ini}
	, {name: 'libzip.so', url: new URL('./libzip.so', import.meta.url)}
];

export default {getLibs};
