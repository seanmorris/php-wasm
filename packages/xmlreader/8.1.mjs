const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number(url.searchParams.get('ini') ?? true));

/**
 * Returns the shared library definitions for this package build.
 * @returns {Array<object>} Shared library definitions for the current package version.
 */
export const getLibs = () => [
	{name: 'php8.1-xmlreader.so', url: new URL('./php8.1-xmlreader.so', import.meta.url), ini}
];

export default {getLibs};
