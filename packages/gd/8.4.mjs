const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export default [
	{url: new URL(`./php8.4-gd.so`, import.meta.url), ini},
	{name: 'libfreetype.so', url: new URL('./libfreetype.so', import.meta.url)},
	{name: 'libwebp.so', url: new URL('./libwebp.so', import.meta.url)},
	{name: 'libjpeg.so', url: new URL('./libjpeg.so', import.meta.url)},
	{name: 'libpng.so', url: new URL('./libpng.so', import.meta.url)},
];
