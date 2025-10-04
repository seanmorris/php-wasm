// const importMeta = import.meta;
// const url = new URL(importMeta.url);
// const ini = !!(Number(  url.searchParams.get('ini') ?? true  ));
// const moduleRoot = url + (String(url).substr(-10) !== '/index.mjs' ? '/' : '');

// export const getLibs = php => [
// 	{url: new URL('./libxml2.so', moduleRoot)},
// ];

export default [
	{name: 'libxml2.so', url: new URL('./libxml2.so', import.meta.url).href}
];
