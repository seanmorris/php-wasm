const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export default [
    {url: new URL('./php8.3-zlib.so', import.meta.url).href, ini},
	{name: 'libz.so', url: new URL('./libz.so', import.meta.url).href},
];
