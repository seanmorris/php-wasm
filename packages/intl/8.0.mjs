const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export default [
	{url: new URL(`./php8.0-intl.so`, import.meta.url), ini},
	{name: 'libicuuc.so', url: new URL('./libicuuc.so',   import.meta.url)},
	{name: 'libicutu.so', url: new URL('./libicutu.so',   import.meta.url)},
	{name: 'libicutest.so', url: new URL('./libicutest.so', import.meta.url)},
	{name: 'libicuio.so', url: new URL('./libicuio.so',   import.meta.url)},
	{name: 'libicui18n.so', url: new URL('./libicui18n.so', import.meta.url)},
	{name: 'libicudata.so', url: new URL('./libicudata.so', import.meta.url)},
];
