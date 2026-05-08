/**
 * Shared php-dbg runtime argument factory used by the VS Code integration.
 */
import { PGlite } from '@electric-sql/pglite';
import { buildType } from './runtimePaths';

const sharedLibs = [];

if(buildType === 'dynamic')
{
	sharedLibs.push(...(await Promise.all([
		import('php-wasm-libxml')
		, import('php-wasm-dom')
		, import('php-wasm-zlib')
		, import('php-wasm-libzip')
		, import('php-wasm-gd')
		, import('php-wasm-iconv')
		, import('php-wasm-intl')
		, import('php-wasm-openssl')
		, import('php-wasm-mbstring')
		, import('php-wasm-sqlite')
		, import('php-wasm-xml')
		, import('php-wasm-simplexml')
		, import('php-wasm-yaml')
	])).map(module => module.default));
}
else if(buildType === 'shared')
{
	sharedLibs.push(
		{name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so', import.meta.url)}
		, {name: 'libzip.so',      url: new URL('php-wasm-libzip/libzip.so', import.meta.url)}
		, {name: 'libfreetype.so', url: new URL('php-wasm-gd/libfreetype.so', import.meta.url)}
		, {name: 'libjpeg.so',     url: new URL('php-wasm-gd/libjpeg.so', import.meta.url)}
		, {name: 'libwebp.so',     url: new URL('php-wasm-gd/libwebp.so', import.meta.url)}
		, {name: 'libpng.so',      url: new URL('php-wasm-gd/libpng.so', import.meta.url)}
		, {name: 'libiconv.so',    url: new URL('php-wasm-iconv/libiconv.so', import.meta.url)}
		, {name: 'libicuuc.so',    url: new URL('php-wasm-intl/libicuuc.so', import.meta.url)}
		, {name: 'libicutu.so',    url: new URL('php-wasm-intl/libicutu.so', import.meta.url)}
		, {name: 'libicutest.so',  url: new URL('php-wasm-intl/libicutest.so', import.meta.url)}
		, {name: 'libicuio.so',    url: new URL('php-wasm-intl/libicuio.so', import.meta.url)}
		, {name: 'libicui18n.so',  url: new URL('php-wasm-intl/libicui18n.so', import.meta.url)}
		, {name: 'libcrypto.so',   url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
		, {name: 'libssl.so',      url: new URL('php-wasm-openssl/libssl.so', import.meta.url)}
		, {name: 'libonig.so',     url: new URL('php-wasm-mbstring/libonig.so', import.meta.url)}
		, {name: 'libsqlite3.so',  url: new URL('php-wasm-sqlite/libsqlite3.so', import.meta.url)}
		, {name: 'libtidy.so',     url: new URL('php-wasm-tidy/libtidy.so', import.meta.url)}
		, {name: 'libyaml.so',     url: new URL('php-wasm-yaml/libyaml.so', import.meta.url)}
	);
}
else
{
	sharedLibs.push(
		{name: 'libcrypto.so', url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
		, {name: 'libssl.so',    url: new URL('php-wasm-openssl/libssl.so', import.meta.url)}
	);
}

/**
 * Creates the runtime configuration passed to php-dbg-wasm instances.
 */
export const createPhpDbgRuntimeArgs = (version = '8.3') => ({
	version
	, sharedLibs
	, ini: `
		date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
		expose_php=0
	`
	, PGlite
	, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
});
