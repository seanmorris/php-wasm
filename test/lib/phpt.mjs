import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strict as assert } from 'node:assert';

import dom from '../../packages/dom/index.mjs';
import iconv from '../../packages/iconv/index.mjs';
import intl from '../../packages/intl/index.mjs';
import libxml from '../../packages/libxml/index.mjs';
import libzip from '../../packages/libzip/index.mjs';
import mbstring from '../../packages/mbstring/index.mjs';
import openssl from '../../packages/openssl/index.mjs';
import phar from '../../packages/phar/index.mjs';
import { PhpCliNode } from '../../packages/php-cli-wasm/PhpCliNode.mjs';
import simplexml from '../../packages/simplexml/index.mjs';
import sqlite from '../../packages/sqlite/index.mjs';
import tidy from '../../packages/tidy/index.mjs';
import xml from '../../packages/xml/index.mjs';
import xmlwriter from '../../packages/xmlwriter/index.mjs';
import yaml from '../../packages/libyaml/index.mjs';
import zlib from '../../packages/zlib/index.mjs';
import { nodeRuntimeOptions, resolveNodeTestEnv } from './node-runtime-options.mjs';

const normalize = text => String(text ?? '').replace(/\r\n/g, '\n');
const normalizeExpectation = text => normalize(text).trim();
const normalizeActualCandidates = text => {
	const normalized = normalizeExpectation(text);
	const withoutTrailingStackTrace = normalized.replace(/\nStack trace:\n(?:#\d+[^\n]*(?:\n|$))+$/u, '');

	return withoutTrailingStackTrace !== normalized
		? [normalized, withoutTrailingStackTrace]
		: [normalized];
};
const extensionPackageMap = new Map([
	['dom', [{ key: 'libxml', module: libxml }, { key: 'dom', module: dom }]]
	, ['gd', [{ key: 'zlib', module: zlib }]]
	, ['iconv', [{ key: 'iconv', module: iconv }]]
	, ['intl', [{ key: 'intl', module: intl }]]
	, ['mbstring', [{ key: 'mbstring', module: mbstring }]]
	, ['openssl', [{ key: 'openssl', module: openssl }]]
	, ['pdo_sqlite', [{ key: 'sqlite', module: sqlite }]]
	, ['phar', [{ key: 'phar', module: phar }]]
	, ['simplexml', [{ key: 'libxml', module: libxml }, { key: 'simplexml', module: simplexml }]]
	, ['sqlite3', [{ key: 'sqlite', module: sqlite }]]
	, ['tidy', [{ key: 'tidy', module: tidy }]]
	, ['xml', [{ key: 'libxml', module: libxml }, { key: 'xml', module: xml }]]
	, ['xmlwriter', [{ key: 'libxml', module: libxml }, { key: 'xmlwriter', module: xmlwriter }]]
	, ['yaml', [{ key: 'yaml', module: yaml }]]
	, ['zip', [{ key: 'zlib', module: zlib }, { key: 'libzip', module: libzip }]]
	, ['zlib', [{ key: 'zlib', module: zlib }]]
]);
const intlLibsOnly = { getLibs: intl.getLibs, getFiles: () => [] };

const parsePhpt = source => {
	const sections = {};
	let currentSection = null;

	for(const line of normalize(source).split('\n'))
	{
		const section = line.match(/^--([A-Z_]+)(?:--)?$/);

		if(section)
		{
			currentSection = section[1];
			sections[currentSection] = '';
			continue;
		}

		if(currentSection)
		{
			sections[currentSection] += line + '\n';
		}
	}

	return sections;
};

const expectfTextToPattern = text => text
	.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&')
	.replaceAll('%e', '[\\\\/]')
	.replaceAll('%s', '[^\\r\\n]+')
	.replaceAll('%S', '[^\\r\\n]*')
	.replaceAll('%a', '[\\s\\S]+')
	.replaceAll('%A', '[\\s\\S]*')
	.replaceAll('%w', '\\s*')
	.replaceAll('%i', '[+-]?\\d+')
	.replaceAll('%d', '\\d+')
	.replaceAll('%x', '[0-9a-fA-F]+')
	.replaceAll('%f', '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[Ee][+-]?\\d+)?')
	.replaceAll('%c', '.');

const expectfToRegExp = expectf => {
	const source = normalize(expectf);
	let pattern = '';
	let cursor = 0;

	while(cursor < source.length)
	{
		const regexStart = source.indexOf('%r', cursor);

		if(regexStart === -1)
		{
			pattern += expectfTextToPattern(source.slice(cursor));
			break;
		}

		pattern += expectfTextToPattern(source.slice(cursor, regexStart));

		const regexEnd = source.indexOf('%r', regexStart + 2);

		if(regexEnd === -1)
		{
			pattern += expectfTextToPattern(source.slice(regexStart));
			break;
		}

		pattern += `(?:${source.slice(regexStart + 2, regexEnd)})`;
		cursor = regexEnd + 2;
	}

	return new RegExp(`^${pattern}$`);
};

const stripHtmlErrorFormatting = text => normalize(text)
	.replace(/\s*\[<a href='[^']*'>[^<]*<\/a>\]/g, '')
	.replace(/<br \/>/g, '')
	.replace(/<\/?b>/g, '')
	.replace(/<\/?a[^>]*>/g, '')
	.replace(/:\s{2,}/g, ': ');

const expectationVariants = expected => {
	const variants = [expected];

	if(!/[<][^>]+[>]/.test(expected.value))
	{
		return variants;
	}

	const stripped = normalizeExpectation(stripHtmlErrorFormatting(expected.value));

	if(stripped && stripped !== expected.value)
	{
		variants.push({ ...expected, value: stripped });
	}

	return variants;
};

const getExpectation = sections => {
	if('EXPECT' in sections)
	{
		return { type: 'EXPECT', value: normalizeExpectation(sections.EXPECT) };
	}

	if('EXPECTF' in sections)
	{
		return { type: 'EXPECTF', value: normalizeExpectation(sections.EXPECTF) };
	}

	if('EXPECTREGEX' in sections)
	{
		return { type: 'EXPECTREGEX', value: normalizeExpectation(sections.EXPECTREGEX) };
	}

	throw new Error('PHPT is missing EXPECT, EXPECTF, or EXPECTREGEX');
};

const expectationMatches = (expected, actual) => {
	return expectationVariants(expected).some(variant => {
		if(variant.type === 'EXPECT')
		{
			return actual === variant.value;
		}

		if(variant.type === 'EXPECTF')
		{
			return expectfToRegExp(variant.value).test(actual);
		}

		return new RegExp(variant.value).test(actual);
	});
};

const assertExpectationMatches = (expected, actual) => {
	for(const candidate of normalizeActualCandidates(actual))
	{
		if(expectationMatches(expected, candidate))
		{
			return candidate;
		}
	}

	if(expected.type === 'EXPECT')
	{
		assert.equal(actual, expected.value);
	}
	else if(expected.type === 'EXPECTF')
	{
		assert.match(actual, expectfToRegExp(expectationVariants(expected).at(-1).value));
	}
	else
	{
		assert.match(actual, new RegExp(expectationVariants(expected).at(-1).value));
	}
};

const collectFixtureFiles = async (rootDir, currentDir = rootDir, relativeDir = '') => {
	const entries = await fs.readdir(currentDir, { withFileTypes: true });
	const files = [];

	for(const entry of entries)
	{
		const hostPath = path.join(currentDir, entry.name);
		const relativePath = path.posix.join(relativeDir, entry.name);

		if(entry.isDirectory())
		{
			files.push(...await collectFixtureFiles(rootDir, hostPath, relativePath));
			continue;
		}

		if(!entry.isFile() || entry.name.endsWith('.phpt'))
		{
			continue;
		}

		files.push({
			parent: path.posix.join('/preload/phpt', path.posix.dirname(relativePath)).replace(/\/\.$/, ''),
			name: path.posix.basename(relativePath),
			url: `file://${hostPath}`
		});
	}

	return files;
};

const substitutePhptPathTokens = (text, phptDir) => String(text ?? '')
	.replaceAll('{PWD}', phptDir);

const parsePhpStringLiteral = value => {
	const trimmed = String(value ?? '').trim();

	if((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
	{
		return trimmed.slice(1, -1);
	}

	return trimmed;
};

const quotePhpSingle = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;

const parseIniSettings = (iniSection, phptDir) => {
	const lines = [];
	let autoPrependFile = null;

	for(const line of normalize(iniSection).split('\n').map(line => line.trim()).filter(Boolean))
	{
		const substituted = substitutePhptPathTokens(line, phptDir);
		const autoPrependMatch = substituted.match(/^auto_prepend_file\s*=(.*)$/);

		if(autoPrependMatch)
		{
			autoPrependFile = parsePhpStringLiteral(autoPrependMatch[1]);
			continue;
		}

		lines.push(substituted);
	}

	return { lines, autoPrependFile };
};

const parseExtensions = extensionSection => [...new Set(
	normalize(extensionSection)
		.split(/\s+/)
		.map(name => name.trim().toLowerCase())
		.filter(Boolean)
)];

const inferExtensionsFromSkipif = skipifSection => [...new Set(
	[...normalize(skipifSection ?? '').matchAll(/extension_loaded\s*\(\s*["']([^"']+)["']\s*\)/g)]
		.map(([, extensionName]) => extensionName.trim().toLowerCase())
		.filter(Boolean)
)];

const inferExtensionSection = phptFile => {
	const normalized = phptFile.replace(/\\/g, '/');
	const match = normalized.match(/\/ext\/([^/]+)\/tests\//);

	if(!match)
	{
		return null;
	}

	return match[1].toLowerCase();
};

const collectReferencedRelativeFiles = async ({ fileBody, phptDir, runtimeDir }) => {
	const files = [];
	const seen = new Set();
	const stringLiteralPattern = /(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1/g;

	for(const match of normalize(fileBody).matchAll(stringLiteralPattern))
	{
		const literal = match[2];
		const relativeLiteral = literal.startsWith('/../') || literal.startsWith('/./')
			? `.${literal}`
			: literal;

		if(!relativeLiteral || relativeLiteral.startsWith('php://') || relativeLiteral.startsWith('http://') || relativeLiteral.startsWith('https://'))
		{
			continue;
		}

		if(!relativeLiteral.startsWith('./') && !relativeLiteral.startsWith('../'))
		{
			continue;
		}

		const hostPath = path.resolve(phptDir, relativeLiteral);
		let stat;

		try
		{
			stat = await fs.stat(hostPath);
		}
		catch
		{
			continue;
		}

		if(!stat.isFile())
		{
			continue;
		}

		const virtualPath = path.posix.normalize(path.posix.join(runtimeDir, relativeLiteral));

		if(seen.has(virtualPath))
		{
			continue;
		}

		seen.add(virtualPath);

		files.push({
			parent: path.posix.dirname(virtualPath)
			, name: path.posix.basename(virtualPath)
			, url: `file://${hostPath}`
		});
	}

	return files;
};

const attachOutput = php => {
	let stdOut = '';
	let stdErr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	return {
		stdOut: () => stdOut
		, stdErr: () => stdErr
	};
};

const probeLoadedExtensions = async ({ version, phpOptions = {} }) => {
	const php = new PhpCliNode(nodeRuntimeOptions({
		...phpOptions
		, runtime: 'cli'
		, version
		, code: 'echo json_encode(array_map("strtolower", get_loaded_extensions()));'
	}));
	const { stdOut, stdErr } = attachOutput(php);

	await php.binary;

	const exitCode = await php.run();

	assert.equal(exitCode, 0, `Extension probe failed for PHP ${version}: ${stdErr()}`);
	assert.equal(stdErr(), '', `Extension probe emitted stderr for PHP ${version}`);

	return new Set(JSON.parse(stdOut()));
};

const resolveExtensionPackages = async ({ sections, version, phpOptions = {} }) => {
	if(!sections.EXTENSIONS)
	{
		return [];
	}

	const requestedExtensions = parseExtensions(sections.EXTENSIONS);

	if(!requestedExtensions.length)
	{
		return [];
	}

	const loadedExtensions = await probeLoadedExtensions({ version, phpOptions });
	const extraPackages = [];
	const seenPackages = new Set();
	const resolvedEnv = resolveNodeTestEnv({ runtime: 'cli', version, ...phpOptions });

	for(const extensionName of requestedExtensions)
	{
		if(loadedExtensions.has(extensionName))
		{
			continue;
		}

		let packages = extensionPackageMap.get(extensionName);

		if(!packages?.length)
		{
			throw new Error(`Unsupported unloaded PHPT extension requirement: ${extensionName}`);
		}

		const buildFlag = ({
			dom: 'WITH_DOM'
			, gd: 'WITH_GD'
			, iconv: 'WITH_ICONV'
			, intl: 'WITH_INTL'
			, mbstring: 'WITH_MBSTRING'
			, openssl: 'WITH_OPENSSL'
			, pdo_sqlite: 'WITH_SQLITE'
			, phar: 'WITH_PHAR'
			, simplexml: 'WITH_SIMPLEXML'
			, sqlite3: 'WITH_SQLITE'
			, tidy: 'WITH_TIDY'
			, xml: 'WITH_XML'
			, xmlwriter: 'WITH_XMLWRITER'
			, yaml: 'WITH_YAML'
			, zip: 'WITH_LIBZIP'
			, zlib: 'WITH_ZLIB'
		})[extensionName];

		if(buildFlag && resolvedEnv[buildFlag] === '0')
		{
			throw new Error(`Required extension ${extensionName} is disabled by ${buildFlag}=0`);
		}

		if(extensionName === 'intl' && resolvedEnv.WITH_INTL === 'shared')
		{
			packages = [{ key: 'intl', module: intlLibsOnly }];
		}

		for(const pkg of packages)
		{
			if(seenPackages.has(pkg.key))
			{
				continue;
			}

			seenPackages.add(pkg.key);
			extraPackages.push(pkg.module);
		}
	}

	return extraPackages;
};

export const runCliPhpt = async ({ phptFile, version, phpOptions = {} }) => {
	const source = await fs.readFile(phptFile, 'utf8');
	const sections = parsePhpt(source);
	const phptDir = path.dirname(phptFile);
	const phptBase = path.basename(phptFile, '.phpt');
	const runtimeDir = '/preload/phpt';
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `phpt-${phptBase}-`));
	const subjectHost = path.join(tempDir, `${phptBase}.php`);
	const prependHost = path.join(tempDir, `prepend-${phptBase}.php`);
	const iniSettings = sections.INI ? parseIniSettings(sections.INI, phptDir) : { lines: [], autoPrependFile: null };

	const fileSection = sections.FILE ?? sections.FILEEOF;

	if(!fileSection)
	{
		throw new Error(`PHPT is missing FILE/FILEEOF section: ${phptFile}`);
	}

	if(!sections.EXTENSIONS)
	{
		const inferredExtensions = new Set(inferExtensionsFromSkipif(sections.SKIPIF));
		const inferredExtension = inferExtensionSection(phptFile);

		if(inferredExtension)
		{
			inferredExtensions.add(inferredExtension);
		}

		if(inferredExtensions.size)
		{
			sections.EXTENSIONS = `${[...inferredExtensions].join('\n')}\n`;
		}
	}

	await fs.writeFile(subjectHost, normalize(fileSection));

	let prependBody = `<?php chdir('${runtimeDir}');`;

	if(iniSettings.autoPrependFile)
	{
		prependBody += ` require ${quotePhpSingle(iniSettings.autoPrependFile)};`;
	}

	await fs.writeFile(prependHost, prependBody);

	const files = [
		{ parent: runtimeDir, name: path.basename(subjectHost), url: `file://${subjectHost}` },
		{ parent: runtimeDir, name: path.basename(prependHost), url: `file://${prependHost}` }
	];
	files.push(...await collectFixtureFiles(phptDir));
	files.push(...await collectReferencedRelativeFiles({ fileBody: fileSection, phptDir, runtimeDir }));
	const extensionPackages = await resolveExtensionPackages({ sections, version, phpOptions });
	const iniEntries = ['docref_ext=.html'];
	if(phpOptions.ini)
	{
		iniEntries.push(phpOptions.ini);
	}
	iniEntries.push(...iniSettings.lines);

	const php = new PhpCliNode(nodeRuntimeOptions({
		...phpOptions,
		runtime: 'cli',
		version,
		ini: iniEntries.join('\n'),
		script: `${runtimeDir}/${path.basename(subjectHost)}`,
		sharedLibs: [...extensionPackages, ...(phpOptions.sharedLibs ?? [])],
		files: [...files, ...(phpOptions.files ?? [])]
	}));

	let stdOut = '';
	let stdErr = '';
	let combined = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line, combined += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line, combined += line)));

	await php.binary;

	const exitCode = await php.run([
		'-d', `auto_prepend_file=${runtimeDir}/${path.basename(prependHost)}`,
	]);
	const actual = normalizeExpectation(combined);
	const expected = getExpectation(sections);
	const matchedActual = assertExpectationMatches(expected, actual) ?? actual;

	await fs.rm(tempDir, { recursive: true, force: true });

	return { actual: matchedActual, expected, exitCode, sections, stdErr, stdOut };
};
