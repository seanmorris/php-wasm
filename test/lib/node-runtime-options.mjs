import fs from 'node:fs';
import path from 'node:path';

import extensionAssets from './extension-assets.js';

const { getPackage, getSupportPackage } = extensionAssets;

const currentEnv = () => globalThis.process?.env ?? {};
const envFlagIsShared = value => value === 'shared';
const envFlagNeedsOpenSslLibs = value => ['1', 'shared', 'dynamic'].includes(value ?? '');
const normalizeBuildMode = value => value === '1' ? 'dynamic' : value;
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
	, cgi: version => path.resolve(`/app/packages/php-cgi-wasm/php${version}-cgi-node.mjs`)
	, cli: version => path.resolve(`/app/packages/php-cli-wasm/php${version}-cli-node.mjs`)
	, dbg: version => path.resolve(`/app/packages/php-dbg-wasm/php${version}-dbg-node.mjs`)
};
const packageBuildFlagMap = {
	dom: 'WITH_DOM'
	, gd: 'WITH_GD'
	, iconv: 'WITH_ICONV'
	, intl: 'WITH_INTL'
	, libxml: 'WITH_LIBXML'
	, libzip: 'WITH_LIBZIP'
	, mbstring: 'WITH_MBSTRING'
	, openssl: 'WITH_OPENSSL'
	, phar: 'WITH_PHAR'
	, simplexml: 'WITH_SIMPLEXML'
	, sqlite: 'WITH_SQLITE'
	, tidy: 'WITH_TIDY'
	, xml: 'WITH_XML'
	, xmlreader: 'WITH_XMLREADER'
	, xmlwriter: 'WITH_XMLWRITER'
	, yaml: 'WITH_YAML'
	, zlib: 'WITH_ZLIB'
};
const runtimeLibraryPackages = {
	cgi: ['libxml', 'dom', 'zlib', 'libzip', 'gd', 'iconv', 'intl', 'openssl', 'mbstring', 'phar', 'sqlite', 'xml', 'simplexml', 'tidy', 'yaml']
};

const sharedLibraryPackages = [
	[env => envFlagIsShared(env.WITH_LIBXML), 'libxml']
	, [env => envFlagIsShared(env.WITH_ZLIB), 'zlib']
	, [env => envFlagIsShared(env.WITH_LIBZIP), 'libzip']
	, [env => (
		envFlagIsShared(env.WITH_GD)
		|| envFlagIsShared(env.WITH_LIBPNG)
		|| envFlagIsShared(env.WITH_FREETYPE)
		|| envFlagIsShared(env.WITH_LIBJPEG)
		|| envFlagIsShared(env.WITH_LIBWEBP)
	), 'gd']
	, [env => envFlagIsShared(env.WITH_ICONV), 'iconv']
	, [env => envFlagIsShared(env.WITH_INTL), 'intl']
	, [env => envFlagIsShared(env.WITH_MBSTRING) || envFlagIsShared(env.WITH_ONIGURUMA), 'mbstring']
	, [env => envFlagNeedsOpenSslLibs(env.WITH_OPENSSL), 'openssl']
	, [env => envFlagIsShared(env.WITH_SQLITE), 'sqlite']
	, [env => envFlagIsShared(env.WITH_TIDY), 'tidy']
	, [env => envFlagIsShared(env.WITH_YAML), 'yaml']
];

const currentPhpVersion = env => env.PHP_VERSION ?? '8.4';
const hasExplicitBuildFlags = env => Object.keys(env).some(key => sharedBuildFlags.has(key));
const currentBuildType = env => String(env.LIB_TYPE ?? '').toLowerCase();

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
	const buildType = currentBuildType(env);
	const runtimeKind = options.runtime;
	const wrapperFile = runtimeKind && runtimeWrapperByKind[runtimeKind]?.(phpVersion);
	const buildTypeEnvFile = buildType && ['dynamic', 'shared', 'static'].includes(buildType)
		? path.resolve(`/app/.github/.env_${phpVersion}.${buildType}.ci`)
		: null;

	if(buildTypeEnvFile)
	{
		return {
			...parseEnvFile(buildTypeEnvFile)
			, ...env
			, PHP_VERSION: phpVersion
		};
	}

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

export const getNodeEnvSharedLibs = (env = currentEnv()) => {
	const phpVersion = currentPhpVersion(env);
	const supportPackages = [];

	for(const [shouldInclude, packageKey] of sharedLibraryPackages)
	{
		if(!shouldInclude(env))
		{
			continue;
		}

		const supportPackage = getSupportPackage(packageKey, phpVersion);

		if(supportPackage.getLibs().length || supportPackage.getFiles().length)
		{
			supportPackages.push(supportPackage);
		}
	}

	return supportPackages;
};

const effectivePackageBuildMode = (packageKey, env = currentEnv()) => normalizeBuildMode(
	env[packageBuildFlagMap[packageKey]] ?? 'dynamic'
);

const getNodeEnvRuntimeLibs = (options = {}, env = currentEnv()) => {
	const runtimePackages = runtimeLibraryPackages[options.runtime] ?? [];

	if(!runtimePackages.length)
	{
		return [];
	}

	const phpVersion = options.version ?? currentPhpVersion(env);
	const resolvedPackages = [];
	const seenPackages = new Set();

	for(const packageKey of runtimePackages)
	{
		if(seenPackages.has(packageKey))
		{
			continue;
		}

		seenPackages.add(packageKey);

		switch(effectivePackageBuildMode(packageKey, env))
		{
			case 'dynamic':
				resolvedPackages.push(getPackage(packageKey, phpVersion));
				break;

			case 'shared':
				resolvedPackages.push(getSupportPackage(packageKey, phpVersion));
				break;
		}
	}

	return resolvedPackages.filter(pkg => pkg.getLibs().length || pkg.getFiles().length);
};

export const nodeRuntimeOptions = (options = {}, env = currentEnv()) => {
	const resolvedEnv = resolveNodeTestEnv(options, env);
	const sharedLibs = [
		...getNodeEnvRuntimeLibs(options, resolvedEnv)
		, ...(options.sharedLibs ?? [])
	];

	if(!sharedLibs.length)
	{
		return options;
	}

	return { ...options, sharedLibs };
};
