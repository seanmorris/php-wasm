const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '../..');
const extensionNamePattern = /^php\d+\.\d+-/;

const packageRoots = {
	dom: path.join(repoRoot, 'packages/dom'),
	gd: path.join(repoRoot, 'packages/gd'),
	iconv: path.join(repoRoot, 'packages/iconv'),
	intl: path.join(repoRoot, 'packages/intl'),
	libxml: path.join(repoRoot, 'packages/libxml'),
	libzip: path.join(repoRoot, 'packages/libzip'),
	mbstring: path.join(repoRoot, 'packages/mbstring'),
	openssl: path.join(repoRoot, 'packages/openssl'),
	phar: path.join(repoRoot, 'packages/phar'),
	simplexml: path.join(repoRoot, 'packages/simplexml'),
	sqlite: path.join(repoRoot, 'packages/sqlite'),
	tidy: path.join(repoRoot, 'packages/tidy'),
	xml: path.join(repoRoot, 'packages/xml'),
	xmlreader: path.join(repoRoot, 'packages/xmlreader'),
	xmlwriter: path.join(repoRoot, 'packages/xmlwriter'),
	yaml: path.join(repoRoot, 'packages/libyaml'),
	zlib: path.join(repoRoot, 'packages/zlib'),
};

const cloneRecord = record => ({ ...record });
const clonePackage = pkg => ({
	getLibs: () => (pkg.getLibs?.() ?? []).map(cloneRecord),
	getFiles: () => (pkg.getFiles?.() ?? []).map(cloneRecord),
});

const fileUrl = hostPath => pathToFileURL(hostPath).href;
const versionedExtension = (phpVersion, name) => `php${phpVersion}-${name}.so`;
const libDef = (packageKey, name, ini) => ({
	name,
	url: fileUrl(path.join(packageRoots[packageKey], name)),
	...(ini === undefined ? {} : { ini }),
});
const preloadFileDef = (packageKey, name, virtualPath) => ({
	name,
	path: virtualPath,
	url: fileUrl(path.join(packageRoots[packageKey], name)),
});

const packageFactories = {
	dom: phpVersion => ({
		getLibs: () => [libDef('dom', versionedExtension(phpVersion, 'dom'), true)],
	}),
	gd: phpVersion => ({
		getLibs: () => [
			libDef('gd', versionedExtension(phpVersion, 'gd'), true),
			libDef('gd', 'libfreetype.so'),
			libDef('gd', 'libwebp.so'),
			libDef('gd', 'libjpeg.so'),
			libDef('gd', 'libpng.so'),
		],
	}),
	iconv: phpVersion => ({
		getLibs: () => [
			libDef('iconv', versionedExtension(phpVersion, 'iconv'), true),
			libDef('iconv', 'libiconv.so'),
		],
	}),
	intl: phpVersion => ({
		getLibs: () => [
			libDef('intl', versionedExtension(phpVersion, 'intl'), true),
			libDef('intl', 'libicuuc.so'),
			libDef('intl', 'libicutu.so'),
			libDef('intl', 'libicutest.so'),
			libDef('intl', 'libicuio.so'),
			libDef('intl', 'libicui18n.so'),
			libDef('intl', 'libicudata.so'),
		],
		getFiles: () => [preloadFileDef('intl', 'icudt72l.dat', '/preload/icudt72l.dat')],
	}),
	libxml: () => ({
		getLibs: () => [libDef('libxml', 'libxml2.so')],
	}),
	libzip: phpVersion => ({
		getLibs: () => [
			libDef('libzip', versionedExtension(phpVersion, 'zip'), true),
			libDef('libzip', 'libzip.so'),
		],
	}),
	mbstring: phpVersion => ({
		getLibs: () => [
			libDef('mbstring', versionedExtension(phpVersion, 'mbstring'), true),
			libDef('mbstring', 'libonig.so'),
		],
	}),
	openssl: phpVersion => ({
		getLibs: () => [
			libDef('openssl', versionedExtension(phpVersion, 'openssl'), true),
			libDef('openssl', 'libssl.so'),
			libDef('openssl', 'libcrypto.so'),
		],
	}),
	phar: phpVersion => ({
		getLibs: () => [libDef('phar', versionedExtension(phpVersion, 'phar'), true)],
	}),
	simplexml: phpVersion => ({
		getLibs: () => [libDef('simplexml', versionedExtension(phpVersion, 'simplexml'), true)],
	}),
	sqlite: phpVersion => ({
		getLibs: () => [
			libDef('sqlite', versionedExtension(phpVersion, 'sqlite'), true),
			libDef('sqlite', versionedExtension(phpVersion, 'pdo-sqlite'), true),
			libDef('sqlite', 'libsqlite3.so'),
		],
	}),
	tidy: phpVersion => ({
		getLibs: () => [
			libDef('tidy', versionedExtension(phpVersion, 'tidy'), true),
			libDef('tidy', 'libtidy.so'),
		],
	}),
	xml: phpVersion => ({
		getLibs: () => [libDef('xml', versionedExtension(phpVersion, 'xml'), true)],
	}),
	xmlreader: phpVersion => ({
		getLibs: () => [libDef('xmlreader', versionedExtension(phpVersion, 'xmlreader'), true)],
	}),
	xmlwriter: phpVersion => ({
		getLibs: () => [libDef('xmlwriter', versionedExtension(phpVersion, 'xmlwriter'), true)],
	}),
	yaml: phpVersion => ({
		getLibs: () => [
			libDef('yaml', versionedExtension(phpVersion, 'yaml'), true),
			libDef('yaml', 'libyaml.so'),
		],
	}),
	zlib: phpVersion => ({
		getLibs: () => [
			libDef('zlib', versionedExtension(phpVersion, 'zlib'), true),
			libDef('zlib', 'libz.so'),
		],
	}),
};

const getPackage = (packageKey, phpVersion = '8.4') => {
	const factory = packageFactories[packageKey];

	if(!factory)
	{
		throw new Error(`Unknown extension asset package: ${packageKey}`);
	}

	return clonePackage(factory(phpVersion));
};

const getSupportPackage = (packageKey, phpVersion = '8.4') => {
	const extensionPackage = getPackage(packageKey, phpVersion);
	const libs = extensionPackage
		.getLibs()
		.filter(lib => !extensionNamePattern.test(lib.name ?? ''));
	const files = extensionPackage.getFiles();

	return clonePackage({
		getLibs: () => libs,
		getFiles: () => files,
	});
};

module.exports = {
	repoRoot,
	packageRoots,
	getPackage,
	getSupportPackage,
	fileUrl,
	preloadFileDef,
	versionedExtension,
};
