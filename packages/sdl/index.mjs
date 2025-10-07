const importMeta = import.meta;
const url = new URL(importMeta.url);
const ini = !!(Number(  url.searchParams.get('ini') ?? true  ));
const moduleRoot = url + (String(url).substr(-10) !== '/index.mjs' ? '/' : '');

export const getLibs = php => [
	{name: 'php${php.phpVersion}-sdl.so', url: new URL('./php${php.phpVersion}-sdl.so', moduleRoot), ini},
];
