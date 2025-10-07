const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export const getLibs = () => [
	{name: 'php8.3-yaml.so', url: new URL('./php8.3-yaml.so', import.meta.url), ini},
	{name: 'libyaml.so', url: new URL('./libyaml.so', import.meta.url)},
];

export default {getLibs};
