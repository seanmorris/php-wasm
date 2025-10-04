const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export default [
	{url: new URL(`./php8.3-mbstring.so`, import.meta.url), ini},
	{name: 'libonig.so', url: new URL('./libonig.so', import.meta.url)},
];
