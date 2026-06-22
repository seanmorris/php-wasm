/**
 * Shared-build support libraries that should be bundled into demo-web.
 */
const intlSharedSupport = {
	getLibs: () => [
		{name: 'libicuuc.so',    url: new URL('php-wasm-intl/libicuuc.so',    import.meta.url)}
		, {name: 'libicutu.so',    url: new URL('php-wasm-intl/libicutu.so',    import.meta.url)}
		, {name: 'libicutest.so',  url: new URL('php-wasm-intl/libicutest.so',  import.meta.url)}
		, {name: 'libicuio.so',    url: new URL('php-wasm-intl/libicuio.so',    import.meta.url)}
		, {name: 'libicui18n.so',  url: new URL('php-wasm-intl/libicui18n.so',  import.meta.url)}
		, {name: 'libicudata.so',  url: new URL('php-wasm-intl/libicudata.so',  import.meta.url)}
	]
	, getFiles: () => [
		{
			name: 'icudt72l.dat'
			, path: '/preload/icudt72l.dat'
			, url: new URL('php-wasm-intl/icudt72l.dat', import.meta.url)
		}
	]
};

export const sharedSupportLibs = [
	{name: 'libxml2.so',     url: new URL('php-wasm-libxml/libxml2.so',    import.meta.url)}
	, {name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so',         import.meta.url)}
	, {name: 'libzip.so',      url: new URL('php-wasm-libzip/libzip.so',     import.meta.url)}
	, {name: 'libfreetype.so', url: new URL('php-wasm-gd/libfreetype.so',    import.meta.url)}
	, {name: 'libjpeg.so',     url: new URL('php-wasm-gd/libjpeg.so',        import.meta.url)}
	, {name: 'libwebp.so',     url: new URL('php-wasm-gd/libwebp.so',        import.meta.url)}
	, {name: 'libpng.so',      url: new URL('php-wasm-gd/libpng.so',         import.meta.url)}
	, {name: 'libiconv.so',    url: new URL('php-wasm-iconv/libiconv.so',    import.meta.url)}
	, intlSharedSupport
	, {name: 'libcrypto.so',   url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)}
	, {name: 'libssl.so',      url: new URL('php-wasm-openssl/libssl.so',    import.meta.url)}
	, {name: 'libonig.so',     url: new URL('php-wasm-mbstring/libonig.so',  import.meta.url)}
	, {name: 'libsqlite3.so',  url: new URL('php-wasm-sqlite/libsqlite3.so', import.meta.url)}
	, {name: 'libtidy.so',     url: new URL('php-wasm-tidy/libtidy.so',      import.meta.url)}
	, {name: 'libyaml.so',     url: new URL('php-wasm-yaml/libyaml.so',      import.meta.url)}
];
