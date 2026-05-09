import gd from '../../packages/gd/index.mjs';
import iconv from '../../packages/iconv/index.mjs';
import intl from '../../packages/intl/index.mjs';
import libxml from '../../packages/libxml/index.mjs';
import libzip from '../../packages/libzip/index.mjs';
import mbstring from '../../packages/mbstring/index.mjs';
import openssl from '../../packages/openssl/index.mjs';
import sqlite from '../../packages/sqlite/index.mjs';
import tidy from '../../packages/tidy/index.mjs';
import yaml from '../../packages/libyaml/index.mjs';
import zlib from '../../packages/zlib/index.mjs';

const currentEnv = () => globalThis.process?.env ?? {};
const envFlagIsShared = value => value === 'shared';
const envFlagNeedsOpenSslLibs = value => ['1', 'shared', 'dynamic'].includes(value ?? '');
const extensionNamePattern = /^php\d+\.\d+-/;

const sharedLibraryPackages = [
	[env => envFlagIsShared(env.WITH_LIBXML), libxml]
	, [env => envFlagIsShared(env.WITH_ZLIB), zlib]
	, [env => envFlagIsShared(env.WITH_LIBZIP), libzip]
	, [env => (
		envFlagIsShared(env.WITH_GD)
		|| envFlagIsShared(env.WITH_LIBPNG)
		|| envFlagIsShared(env.WITH_FREETYPE)
		|| envFlagIsShared(env.WITH_LIBJPEG)
		|| envFlagIsShared(env.WITH_LIBWEBP)
	), gd]
	, [env => envFlagIsShared(env.WITH_ICONV), iconv]
	, [env => envFlagIsShared(env.WITH_INTL), intl]
	, [env => envFlagIsShared(env.WITH_MBSTRING) || envFlagIsShared(env.WITH_ONIGURUMA), mbstring]
	, [env => envFlagNeedsOpenSslLibs(env.WITH_OPENSSL), openssl]
	, [env => envFlagIsShared(env.WITH_SQLITE), sqlite]
	, [env => envFlagIsShared(env.WITH_TIDY), tidy]
	, [env => envFlagIsShared(env.WITH_YAML), yaml]
];

const currentPhpVersion = env => env.PHP_VERSION ?? '8.4';

const supportLibsFromPackage = (pkg, phpVersion) => (
	(pkg.getLibs?.({ phpVersion }) ?? [])
		.filter(lib => typeof lib === 'object')
		.filter(lib => !extensionNamePattern.test(lib.name ?? ''))
		.map(lib => ({ ...lib }))
);

export const getNodeEnvSharedLibs = (env = currentEnv()) => {
	const phpVersion = currentPhpVersion(env);
	const libsByName = new Map();

	for(const [shouldInclude, pkg] of sharedLibraryPackages)
	{
		if(!shouldInclude(env))
		{
			continue;
		}

		for(const lib of supportLibsFromPackage(pkg, phpVersion))
		{
			libsByName.has(lib.name) || libsByName.set(lib.name, lib);
		}
	}

	return [...libsByName.values()];
};

export const nodeRuntimeOptions = (options = {}, env = currentEnv()) => {
	const sharedLibs = [
		...getNodeEnvSharedLibs(env)
		, ...(options.sharedLibs ?? [])
	];

	if(!sharedLibs.length)
	{
		return options;
	}

	return { ...options, sharedLibs };
};
