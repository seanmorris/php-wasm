const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export const getLibs = () => [
    {name: 'php8.4-sqlite.so', url: new URL('./php8.4-sqlite.so', import.meta.url), ini},
	{name: 'php8.4-pdo-sqlite.so', url: new URL('./php8.4-pdo-sqlite.so', import.meta.url), ini},
	{name: 'libsqlite3.so', url: new URL('./libsqlite3.so', import.meta.url)},
];

export default {getLibs};
