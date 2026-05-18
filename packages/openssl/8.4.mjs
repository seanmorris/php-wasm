const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

/**
 * Returns the shared library definitions for this package build.
 * @returns {Array<object>} Shared library definitions for the current package version.
 */
export const getLibs = () => [
	{name: 'php8.4-openssl.so', url: new URL('./php8.4-openssl.so', import.meta.url), ini}
	, {name: 'libssl.so', url: new URL('./libssl.so', import.meta.url)}
	, {name: 'libcrypto.so', url: new URL('./libcrypto.so', import.meta.url)}
];

export default {getLibs};
