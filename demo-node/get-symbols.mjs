#!/usr/bin/env node
import { PhpNode } from 'php-wasm/PhpNode.mjs';
import fs from 'node:fs';

const sharedLibs = [];
const buildType = process.env.BUILD_TYPE ?? 'dynamic';

console.log({buildType});

if(buildType === 'static')
{
    sharedLibs.push(
        {name: 'libcrypto.so', url: new URL('node_modules/php-wasm-openssl/libcrypto.so', import.meta.url)},
        {name: 'libssl.so',    url: new URL('node_modules/php-wasm-openssl/libssl.so',    import.meta.url)},
    );
}
else if(buildType === 'shared')
{
	sharedLibs.push(
		{name: 'libxml2.so', url: (new URL('node_modules/php-wasm-libxml/libxml2.so',       import.meta.url))},
		
		{name: 'libz.so',        url: new URL('node_modules/php-wasm-zlib/libz.so',         import.meta.url)},
		{name: 'libzip.so',      url: new URL('node_modules/php-wasm-libzip/libzip.so',     import.meta.url)},
		{name: 'libfreetype.so', url: new URL('node_modules/php-wasm-gd/libfreetype.so',    import.meta.url)},
		{name: 'libjpeg.so',     url: new URL('node_modules/php-wasm-gd/libjpeg.so',        import.meta.url)},
		{name: 'libwebp.so',     url: new URL('node_modules/php-wasm-gd/libwebp.so',        import.meta.url)},
		{name: 'libpng.so',      url: new URL('node_modules/php-wasm-gd/libpng.so',         import.meta.url)},
		{name: 'libiconv.so',    url: new URL('node_modules/php-wasm-iconv/libiconv.so',    import.meta.url)},
		{name: 'libicuuc.so',    url: new URL('node_modules/php-wasm-intl/libicuuc.so',     import.meta.url)},
		{name: 'libicutu.so',    url: new URL('node_modules/php-wasm-intl/libicutu.so',     import.meta.url)},
		{name: 'libicutest.so',  url: new URL('node_modules/php-wasm-intl/libicutest.so',   import.meta.url)},
		{name: 'libicuio.so',    url: new URL('node_modules/php-wasm-intl/libicuio.so',     import.meta.url)},
		{name: 'libicui18n.so',  url: new URL('node_modules/php-wasm-intl/libicui18n.so',   import.meta.url)},
		{name: 'libicudata.so',  url: new URL('node_modules/php-wasm-intl/libicudata.so',   import.meta.url)},
		{name: 'libcrypto.so',   url: new URL('node_modules/php-wasm-openssl/libcrypto.so', import.meta.url)},
		{name: 'libssl.so',      url: new URL('node_modules/php-wasm-openssl/libssl.so',    import.meta.url)},
		{name: 'libonig.so',     url: new URL('node_modules/php-wasm-mbstring/libonig.so',  import.meta.url)},
		{name: 'libsqlite3.so',  url: new URL('node_modules/php-wasm-sqlite/libsqlite3.so', import.meta.url)},
		{name: 'libtidy.so',     url: new URL('node_modules/php-wasm-tidy/libtidy.so',      import.meta.url)},
		{name: 'libyaml.so',     url: new URL('node_modules/php-wasm-yaml/libyaml.so',      import.meta.url)},
	);
}
const [version, envName] = process.argv.slice(2);

console.log({version, envName, sharedLibs, buildType});

const php = new PhpNode({version, envName, sharedLibs, buildType});

php.addEventListener('output', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
php.addEventListener('error', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));

php.run( fs.readFileSync('demo-node/persist/symbols.php') );
