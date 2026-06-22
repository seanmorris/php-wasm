/**
 * Returns the shared library definitions for this package build.
 * @returns {Array<object>} Shared library definitions for the current package version.
 */
export const getLibs = () => [
	{name: 'libxml2.so', url: new URL('./libxml2.so', import.meta.url).href}
];

export default {getLibs};
