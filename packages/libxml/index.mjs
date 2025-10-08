export const getLibs = () => [
	{name: 'libxml2.so', url: new URL('./libxml2.so', import.meta.url).href}
];

export default {getLibs};
