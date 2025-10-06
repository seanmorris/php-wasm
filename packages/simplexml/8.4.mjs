const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export const getLibs = () => [
    {url: new URL(`./php8.4-simplexml.so`, import.meta.url), ini},
];

export default {getLibs};
