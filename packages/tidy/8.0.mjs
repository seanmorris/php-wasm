const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export default [
	{url: new URL(`./php8.0-tidy.so`, import.meta.url), ini},
	{name: 'libtidy.so', url: new URL('./libtidy.so', import.meta.url)},
];
