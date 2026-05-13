import fs from 'node:fs';
import path from 'node:path';

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
const sharedWrapperMarkers = ['php.data', 'getDylinkMetadata', 'LDSO'];
const sharedBuildFlags = new Set([
	'WITH_LIBXML'
	, 'WITH_ZLIB'
	, 'WITH_LIBZIP'
	, 'WITH_GD'
	, 'WITH_LIBPNG'
	, 'WITH_FREETYPE'
	, 'WITH_LIBJPEG'
	, 'WITH_LIBWEBP'
	, 'WITH_ICONV'
	, 'WITH_INTL'
	, 'WITH_MBSTRING'
	, 'WITH_ONIGURUMA'
	, 'WITH_OPENSSL'
	, 'WITH_SQLITE'
	, 'WITH_XMLREADER'
	, 'WITH_TIDY'
	, 'WITH_YAML'
]);
const runtimeWrapperByKind = {
	php: version => path.resolve(`/app/packages/php-wasm/php${version}-node.mjs`)
	, cli: version => path.resolve(`/app/packages/php-cli-wasm/php${version}-cli-node.mjs`)
	, dbg: version => path.resolve(`/app/packages/php-dbg-wasm/php${version}-dbg-node.mjs`)
};

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
const hasExplicitBuildFlags = env => Object.keys(env).some(key => sharedBuildFlags.has(key));

const parseEnvFile = envFile => {
	if(!fs.existsSync(envFile))
	{
		return {};
	}

	return fs.readFileSync(envFile, 'utf8')
		.split(/\r?\n/)
		.reduce((parsed, line) => {
			const trimmed = line.trim();

			if(!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || !trimmed.includes('='))
			{
				return parsed;
			}

			const [key, ...rest] = trimmed.split('=');
			parsed[key] = rest.join('=');
			return parsed;
		}, {});
};

const runtimeLooksShared = wrapperFile => {
	if(!wrapperFile || !fs.existsSync(wrapperFile))
	{
		return false;
	}

	const wrapperSource = fs.readFileSync(wrapperFile, 'utf8');

	return sharedWrapperMarkers.every(marker => wrapperSource.includes(marker));
};

export const resolveNodeTestEnv = (options = {}, env = currentEnv()) => {
	if(hasExplicitBuildFlags(env))
	{
		return env;
	}

	const phpVersion = options.version ?? currentPhpVersion(env);
	const runtimeKind = options.runtime;
	const wrapperFile = runtimeKind && runtimeWrapperByKind[runtimeKind]?.(phpVersion);

	if(!runtimeLooksShared(wrapperFile))
	{
		return env;
	}

	const sharedEnvFile = path.resolve(`/app/.github/.env_${phpVersion}.shared.ci`);

	return {
		...parseEnvFile(sharedEnvFile)
		, ...env
		, PHP_VERSION: phpVersion
	};
};

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
	const resolvedEnv = resolveNodeTestEnv(options, env);
	const sharedLibs = [
		...getNodeEnvSharedLibs(resolvedEnv)
		, ...(options.sharedLibs ?? [])
	];

	if(!sharedLibs.length)
	{
		return options;
	}

	return { ...options, sharedLibs };
};
