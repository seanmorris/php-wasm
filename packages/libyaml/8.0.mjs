const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

const getLibs = () => [
	{url: new URL(`./php8.0-yaml.so`, import.meta.url), ini},
	{url: new URL('./libyaml.so', import.meta.url)},
];

export default {getLibs};
