import dom from '/packages/dom/index.mjs';
import gd from '/packages/gd/index.mjs';
import iconv from '/packages/iconv/index.mjs';
import intl from '/packages/intl/index.mjs';
import libxml from '/packages/libxml/index.mjs';
import libzip from '/packages/libzip/index.mjs';
import mbstring from '/packages/mbstring/index.mjs';
import openssl from '/packages/openssl/index.mjs';
import simplexml from '/packages/simplexml/index.mjs';
import sqlite from '/packages/sqlite/index.mjs';
import tidy from '/packages/tidy/index.mjs';
import xml from '/packages/xml/index.mjs';
import yaml from '/packages/libyaml/index.mjs';
import zlib from '/packages/zlib/index.mjs';

const assetUrl = path => new URL(`../../packages/${path}`, import.meta.url);

const sharedLib = (name, path) => ({name, url: assetUrl(path)});
const intlSharedSupport = {
	getLibs: () => [
		sharedLib('libicuuc.so', 'intl/libicuuc.so')
		, sharedLib('libicutu.so', 'intl/libicutu.so')
		, sharedLib('libicutest.so', 'intl/libicutest.so')
		, sharedLib('libicuio.so', 'intl/libicuio.so')
		, sharedLib('libicui18n.so', 'intl/libicui18n.so')
		, sharedLib('libicudata.so', 'intl/libicudata.so')
	]
	, getFiles: () => [
		{
			name: 'icudt72l.dat'
			, path: '/preload/icudt72l.dat'
			, url: assetUrl('intl/icudt72l.dat')
		}
	]
};

const toggleableModules = [
	['php-wasm-dom', 1, dom]
	, ['php-wasm-gd', 2, gd]
	, ['php-wasm-iconv', 4, iconv]
	, ['php-wasm-intl', 8, intl]
	, ['php-wasm-libxml', 16, libxml]
	, ['php-wasm-yaml', 32, yaml]
	, ['php-wasm-libzip', 64, libzip]
	, ['php-wasm-mbstring', 128, mbstring]
	, ['php-wasm-openssl', 256, openssl]
	, ['php-wasm-simplexml', 512, simplexml]
	, ['php-wasm-sqlite', 1024, sqlite]
	, ['php-wasm-xml', 2048, xml]
	, ['php-wasm-zlib', 4096, zlib]
];

const dynamicCliLibs = [
	libxml
	, dom
	, zlib
	, libzip
	, gd
	, iconv
	, intl
	, openssl
	, mbstring
	, sqlite
	, xml
	, simplexml
	, tidy
	, yaml
];

const dynamicDbgLibs = [
	libxml
	, dom
	, zlib
	, libzip
	, gd
	, iconv
	, intl
	, openssl
	, mbstring
	, sqlite
	, xml
	, simplexml
	, yaml
];

const dynamicCgiLibs = [
	libxml
	, dom
	, zlib
	, libzip
	, gd
	, iconv
	, intl
	, openssl
	, mbstring
	, sqlite
	, xml
	, simplexml
	, tidy
	, yaml
];

const sharedEmbeddedLibs = [
	sharedLib('libxml2.so', 'libxml/libxml2.so')
	, sharedLib('libz.so', 'zlib/libz.so')
	, sharedLib('libzip.so', 'libzip/libzip.so')
	, sharedLib('libfreetype.so', 'gd/libfreetype.so')
	, sharedLib('libjpeg.so', 'gd/libjpeg.so')
	, sharedLib('libwebp.so', 'gd/libwebp.so')
	, sharedLib('libpng.so', 'gd/libpng.so')
	, sharedLib('libiconv.so', 'iconv/libiconv.so')
	, intlSharedSupport
	, sharedLib('libcrypto.so', 'openssl/libcrypto.so')
	, sharedLib('libssl.so', 'openssl/libssl.so')
	, sharedLib('libonig.so', 'mbstring/libonig.so')
	, sharedLib('libsqlite3.so', 'sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', 'tidy/libtidy.so')
	, sharedLib('libyaml.so', 'libyaml/libyaml.so')
];

const sharedCliLibs = [
	sharedLib('libxml2.so', 'libxml/libxml2.so')
	, sharedLib('libz.so', 'zlib/libz.so')
	, sharedLib('libzip.so', 'libzip/libzip.so')
	, sharedLib('libfreetype.so', 'gd/libfreetype.so')
	, sharedLib('libjpeg.so', 'gd/libjpeg.so')
	, sharedLib('libwebp.so', 'gd/libwebp.so')
	, sharedLib('libpng.so', 'gd/libpng.so')
	, sharedLib('libiconv.so', 'iconv/libiconv.so')
	, intlSharedSupport
	, sharedLib('libcrypto.so', 'openssl/libcrypto.so')
	, sharedLib('libssl.so', 'openssl/libssl.so')
	, sharedLib('libonig.so', 'mbstring/libonig.so')
	, sharedLib('libsqlite3.so', 'sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', 'tidy/libtidy.so')
	, sharedLib('libyaml.so', 'libyaml/libyaml.so')
];

const sharedDbgLibs = [
	sharedLib('libxml2.so', 'libxml/libxml2.so')
	, sharedLib('libz.so', 'zlib/libz.so')
	, sharedLib('libzip.so', 'libzip/libzip.so')
	, sharedLib('libfreetype.so', 'gd/libfreetype.so')
	, sharedLib('libjpeg.so', 'gd/libjpeg.so')
	, sharedLib('libwebp.so', 'gd/libwebp.so')
	, sharedLib('libpng.so', 'gd/libpng.so')
	, sharedLib('libiconv.so', 'iconv/libiconv.so')
	, intlSharedSupport
	, sharedLib('libcrypto.so', 'openssl/libcrypto.so')
	, sharedLib('libssl.so', 'openssl/libssl.so')
	, sharedLib('libonig.so', 'mbstring/libonig.so')
	, sharedLib('libsqlite3.so', 'sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', 'tidy/libtidy.so')
	, sharedLib('libyaml.so', 'libyaml/libyaml.so')
];

const sharedCgiLibs = [
	sharedLib('libxml2.so', 'libxml/libxml2.so')
	, sharedLib('libz.so', 'zlib/libz.so')
	, sharedLib('libzip.so', 'libzip/libzip.so')
	, sharedLib('libfreetype.so', 'gd/libfreetype.so')
	, sharedLib('libjpeg.so', 'gd/libjpeg.so')
	, sharedLib('libwebp.so', 'gd/libwebp.so')
	, sharedLib('libpng.so', 'gd/libpng.so')
	, sharedLib('libiconv.so', 'iconv/libiconv.so')
	, intlSharedSupport
	, sharedLib('libcrypto.so', 'openssl/libcrypto.so')
	, sharedLib('libssl.so', 'openssl/libssl.so')
	, sharedLib('libonig.so', 'mbstring/libonig.so')
	, sharedLib('libsqlite3.so', 'sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', 'tidy/libtidy.so')
	, sharedLib('libyaml.so', 'libyaml/libyaml.so')
];

const pickLibsForLibType = (libType, dynamicLibs, sharedLibs) => {
	if(libType === 'dynamic')
	{
		return dynamicLibs;
	}

	if(libType === 'shared')
	{
		return sharedLibs;
	}

	return [];
};

export const loadEmbeddedSharedLibs = libType => {
	if(libType === 'dynamic')
	{
		return [];
	}

	if(libType === 'shared')
	{
		// Match demo-web so the core shared runtime resolves side modules
		// through locateFile using package-local asset URLs.
		return sharedEmbeddedLibs;
	}

	return [];
};

export const loadEmbeddedExtensionLibs = (libType, flags) => {
	if(libType !== 'dynamic' || !flags)
	{
		return [];
	}

	const sharedLibs = [];

	for(const [, bit, module] of toggleableModules)
	{
		if(flags & bit)
		{
			sharedLibs.push(module);
		}
	}

	return sharedLibs;
};

export const loadEmbeddedDynamicLibs = demoName => {
	if(demoName !== 'dynamic-extension.php')
	{
		return [];
	}

	return [yaml];
};

export const loadCliSharedLibs = libType => pickLibsForLibType(
	libType,
	dynamicCliLibs,
	sharedCliLibs
);

export const loadDbgSharedLibs = libType => pickLibsForLibType(
	libType,
	dynamicDbgLibs,
	sharedDbgLibs
);

export const loadCgiSharedLibs = libType => pickLibsForLibType(
	libType,
	dynamicCgiLibs,
	sharedCgiLibs
);
