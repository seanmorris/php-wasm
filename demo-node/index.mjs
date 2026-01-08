#!/usr/bin/env node
import http from 'node:http';
import { PhpCgiNode } from 'php-cgi-wasm/PhpCgiNode.mjs';

const buildType = process.env.BUILD_TYPE ?? 'dynamic';
const sharedLibs = [];

if(buildType === 'dynamic')
{
	sharedLibs.push(
		await import('php-wasm-intl')
		, await import('php-wasm-libxml')
		, await import('php-wasm-phar')
		, await import('php-wasm-mbstring')
		, await import('php-wasm-openssl')
		, await import('php-wasm-dom')
		, await import('php-wasm-xml')
		, await import('php-wasm-simplexml')
		, await import('php-wasm-sqlite')
		, await import('php-wasm-zlib')
		, await import('php-wasm-gd')
	);
}
else if(buildType === 'shared')
{
	sharedLibs.push(
		{name: 'libxml2.so',     url: new URL('php-wasm-libxml/libxml2.so',    import.meta.url)},
		{name: 'libz.so',        url: new URL('php-wasm-zlib/libz.so',         import.meta.url)},
		{name: 'libzip.so',      url: new URL('php-wasm-libzip/libzip.so',     import.meta.url)},
		{name: 'libfreetype.so', url: new URL('php-wasm-gd/libfreetype.so',    import.meta.url)},
		{name: 'libjpeg.so',     url: new URL('php-wasm-gd/libjpeg.so',        import.meta.url)},
		{name: 'libwebp.so',     url: new URL('php-wasm-gd/libwebp.so',        import.meta.url)},
		{name: 'libpng.so',      url: new URL('php-wasm-gd/libpng.so',         import.meta.url)},
		{name: 'libiconv.so',    url: new URL('php-wasm-iconv/libiconv.so',    import.meta.url)},
		{name: 'libicuuc.so',    url: new URL('php-wasm-intl/libicuuc.so',     import.meta.url)},
		{name: 'libicutu.so',    url: new URL('php-wasm-intl/libicutu.so',     import.meta.url)},
		{name: 'libicutest.so',  url: new URL('php-wasm-intl/libicutest.so',   import.meta.url)},
		{name: 'libicuio.so',    url: new URL('php-wasm-intl/libicuio.so',     import.meta.url)},
		{name: 'libicui18n.so',  url: new URL('php-wasm-intl/libicui18n.so',   import.meta.url)},
		{name: 'libicudata.so',  url: new URL('php-wasm-intl/libicudata.so',   import.meta.url)},
		{name: 'libcrypto.so',   url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)},
		{name: 'libssl.so',      url: new URL('php-wasm-openssl/libssl.so',    import.meta.url)},
		{name: 'libonig.so',     url: new URL('php-wasm-mbstring/libonig.so',  import.meta.url)},
		{name: 'libsqlite3.so',  url: new URL('php-wasm-sqlite/libsqlite3.so', import.meta.url)},
		{name: 'libtidy.so',     url: new URL('php-wasm-tidy/libtidy.so',      import.meta.url)},
		{name: 'libyaml.so',     url: new URL('php-wasm-yaml/libyaml.so',      import.meta.url)},
	);
}
if(buildType === 'static')
{
	sharedLibs.push(
		{name: 'libcrypto.so', url: (new URL('php-wasm-openssl/libcrypto.so', import.meta.url))},
		{name: 'libssl.so',    url: (new URL('php-wasm-openssl/libssl.so', import.meta.url))},
	);
}

const php = new PhpCgiNode({
	version: process.env.PHP_VERSION ?? '8.3'
	, sharedLibs
	, prefix: '/php-wasm/cgi-bin/'
	, docroot: '/persist/www'
	, persist: [
		{mountPath: '/persist' , localPath: './persist'}
		, {mountPath: '/config' , localPath: './config'}
	]
	, types: {
		jpeg: 'image/jpeg'
		, jpg: 'image/jpeg'
		, gif: 'image/gif'
		, png: 'image/png'
		, svg: 'image/svg+xml'
	}
});

console.error('Open "\x1b[33mhttp://localhost:3003/php-wasm/cgi-bin\x1b[0m" in your browser...');

const server = http.createServer(async (request, response) => {
	const result = await php.request(request);
	const reader = result.body.getReader();

	response.writeHead(result.status, [...result.headers.entries()].flat());

	let done = false;
	while (!done)
	{
		const chunk = await reader.read();
		done = chunk.done;
		chunk.value && response.write(chunk.value);
	}

	response.end();
});

server.listen(3003);
