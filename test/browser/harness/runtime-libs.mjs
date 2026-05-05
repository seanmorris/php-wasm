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

const assetUrl = path => new URL(path, globalThis.location.origin);

const sharedLib = (name, path) => ({name, url: assetUrl(path)});

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
	sharedLib('libxml2.so', '/packages/libxml/libxml2.so')
	, sharedLib('libz.so', '/packages/zlib/libz.so')
	, sharedLib('libzip.so', '/packages/libzip/libzip.so')
	, sharedLib('libfreetype.so', '/packages/gd/libfreetype.so')
	, sharedLib('libjpeg.so', '/packages/gd/libjpeg.so')
	, sharedLib('libwebp.so', '/packages/gd/libwebp.so')
	, sharedLib('libpng.so', '/packages/gd/libpng.so')
	, sharedLib('libiconv.so', '/packages/iconv/libiconv.so')
	, sharedLib('libicuuc.so', '/packages/intl/libicuuc.so')
	, sharedLib('libicutu.so', '/packages/intl/libicutu.so')
	, sharedLib('libicutest.so', '/packages/intl/libicutest.so')
	, sharedLib('libicuio.so', '/packages/intl/libicuio.so')
	, sharedLib('libicui18n.so', '/packages/intl/libicui18n.so')
	, sharedLib('libicudata.so', '/packages/intl/libicudata.so')
	, sharedLib('libcrypto.so', '/packages/openssl/libcrypto.so')
	, sharedLib('libssl.so', '/packages/openssl/libssl.so')
	, sharedLib('libonig.so', '/packages/mbstring/libonig.so')
	, sharedLib('libsqlite3.so', '/packages/sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', '/packages/tidy/libtidy.so')
	, sharedLib('libyaml.so', '/packages/libyaml/libyaml.so')
];

const sharedCliLibs = [
	sharedLib('libz.so', '/packages/zlib/libz.so')
	, sharedLib('libzip.so', '/packages/libzip/libzip.so')
	, sharedLib('libfreetype.so', '/packages/gd/libfreetype.so')
	, sharedLib('libjpeg.so', '/packages/gd/libjpeg.so')
	, sharedLib('libwebp.so', '/packages/gd/libwebp.so')
	, sharedLib('libpng.so', '/packages/gd/libpng.so')
	, sharedLib('libiconv.so', '/packages/iconv/libiconv.so')
	, sharedLib('libicuuc.so', '/packages/intl/libicuuc.so')
	, sharedLib('libicutu.so', '/packages/intl/libicutu.so')
	, sharedLib('libicutest.so', '/packages/intl/libicutest.so')
	, sharedLib('libicuio.so', '/packages/intl/libicuio.so')
	, sharedLib('libicui18n.so', '/packages/intl/libicui18n.so')
	, sharedLib('libicudata.so', '/packages/intl/libicudata.so')
	, sharedLib('libcrypto.so', '/packages/openssl/libcrypto.so')
	, sharedLib('libssl.so', '/packages/openssl/libssl.so')
	, sharedLib('libonig.so', '/packages/mbstring/libonig.so')
	, sharedLib('libsqlite3.so', '/packages/sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', '/packages/tidy/libtidy.so')
	, sharedLib('libyaml.so', '/packages/libyaml/libyaml.so')
];

const sharedDbgLibs = [
	sharedLib('libz.so', '/packages/zlib/libz.so')
	, sharedLib('libzip.so', '/packages/libzip/libzip.so')
	, sharedLib('libfreetype.so', '/packages/gd/libfreetype.so')
	, sharedLib('libjpeg.so', '/packages/gd/libjpeg.so')
	, sharedLib('libwebp.so', '/packages/gd/libwebp.so')
	, sharedLib('libpng.so', '/packages/gd/libpng.so')
	, sharedLib('libiconv.so', '/packages/iconv/libiconv.so')
	, sharedLib('libicuuc.so', '/packages/intl/libicuuc.so')
	, sharedLib('libicutu.so', '/packages/intl/libicutu.so')
	, sharedLib('libicutest.so', '/packages/intl/libicutest.so')
	, sharedLib('libicuio.so', '/packages/intl/libicuio.so')
	, sharedLib('libicui18n.so', '/packages/intl/libicui18n.so')
	, sharedLib('libicudata.so', '/packages/intl/libicudata.so')
	, sharedLib('libcrypto.so', '/packages/openssl/libcrypto.so')
	, sharedLib('libssl.so', '/packages/openssl/libssl.so')
	, sharedLib('libonig.so', '/packages/mbstring/libonig.so')
	, sharedLib('libsqlite3.so', '/packages/sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', '/packages/tidy/libtidy.so')
	, sharedLib('libyaml.so', '/packages/libyaml/libyaml.so')
];

const sharedCgiLibs = [
	sharedLib('libz.so', '/packages/zlib/libz.so')
	, sharedLib('libzip.so', '/packages/libzip/libzip.so')
	, sharedLib('libfreetype.so', '/packages/gd/libfreetype.so')
	, sharedLib('libjpeg.so', '/packages/gd/libjpeg.so')
	, sharedLib('libwebp.so', '/packages/gd/libwebp.so')
	, sharedLib('libpng.so', '/packages/gd/libpng.so')
	, sharedLib('libiconv.so', '/packages/iconv/libiconv.so')
	, sharedLib('libicuuc.so', '/packages/intl/libicuuc.so')
	, sharedLib('libicutu.so', '/packages/intl/libicutu.so')
	, sharedLib('libicutest.so', '/packages/intl/libicutest.so')
	, sharedLib('libicuio.so', '/packages/intl/libicuio.so')
	, sharedLib('libicui18n.so', '/packages/intl/libicui18n.so')
	, sharedLib('libicudata.so', '/packages/intl/libicudata.so')
	, sharedLib('libcrypto.so', '/packages/openssl/libcrypto.so')
	, sharedLib('libssl.so', '/packages/openssl/libssl.so')
	, sharedLib('libonig.so', '/packages/mbstring/libonig.so')
	, sharedLib('libsqlite3.so', '/packages/sqlite/libsqlite3.so')
	, sharedLib('libtidy.so', '/packages/tidy/libtidy.so')
	, sharedLib('libyaml.so', '/packages/libyaml/libyaml.so')
];

const staticLibs = [
	sharedLib('libcrypto.so', '/packages/openssl/libcrypto.so')
	, sharedLib('libssl.so', '/packages/openssl/libssl.so')
];

const pickLibsForBuildType = (buildType, dynamicLibs, sharedLibs) => {
	if(buildType === 'dynamic')
	{
		return dynamicLibs;
	}

	if(buildType === 'shared')
	{
		return sharedLibs;
	}

	return staticLibs;
};

export const loadEmbeddedSharedLibs = buildType => {
	if(buildType === 'dynamic')
	{
		return [];
	}

	return staticLibs;
};

export const loadEmbeddedExtensionLibs = (buildType, flags) => {
	if(!flags)
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

export const loadCliSharedLibs = buildType => pickLibsForBuildType(
	buildType,
	dynamicCliLibs,
	sharedCliLibs
);

export const loadDbgSharedLibs = buildType => pickLibsForBuildType(
	buildType,
	dynamicDbgLibs,
	sharedDbgLibs
);

export const loadCgiSharedLibs = buildType => pickLibsForBuildType(
	buildType,
	dynamicCgiLibs,
	sharedCgiLibs
);
