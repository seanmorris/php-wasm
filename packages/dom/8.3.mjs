const importMeta = import.meta;
const url = new URL(importMeta.url ?? 'http://example.com#this-is-an-error-supression-hack');
const ini = !!(Number( url.searchParams.get('ini') ?? true ));

export const getLibs = () => [
    {name: 'php8.3-dom.so', url: new URL('./php8.3-dom.so', import.meta.url).href, ini}
];

export default {getLibs};
