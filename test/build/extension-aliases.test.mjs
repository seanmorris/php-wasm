import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const aliases = [
	['dom/static', 'DOM', 'dynamic']
	, ['fileinfo/static', 'FILEINFO', 'dynamic']
	, ['gd/static', 'GD', 'dynamic']
	, ...['FREETYPE', 'LIBJPEG', 'LIBPNG', 'LIBWEBP'].map(flag => ['gd/static', flag, 'shared'])
	, ['iconv/static', 'ICONV', 'dynamic']
	, ['intl/pre', 'INTL', 'dynamic']
	, ['libxml/static', 'LIBXML', 'dynamic']
	, ['libyaml/static', 'YAML', 'dynamic']
	, ['libzip/static', 'LIBZIP', 'dynamic']
	, ['mbstring/static', 'MBSTRING', 'dynamic']
	, ['mbstring/static', 'ONIGURUMA', 'dynamic']
	, ['openssl/static', 'OPENSSL', 'dynamic']
	, ['phar/static', 'PHAR', 'dynamic']
	, ['simplexml/static', 'SIMPLEXML', 'dynamic']
	, ['sqlite/static', 'SQLITE', 'dynamic']
	, ['tidy/static', 'TIDY', 'dynamic']
	, ['xml/static', 'XML', 'dynamic']
	, ['xmlreader/static', 'XMLREADER', 'dynamic']
	, ['xmlwriter/static', 'XMLWRITER', 'dynamic']
	, ['zlib/static', 'ZLIB', 'dynamic']
	, ['curl/pre', 'CURL', 'dynamic']
	, ['vrzno/pre', 'VRZNO', 'static']
	, ['waitline/pre', 'WAITLINE', 'static']
	, ['pdo-pglite/pre', 'PDO_PGLITE', 'static']
];
const inventory = [
	'CONFIGURE_FLAGS', 'PHP_CONFIGURE_DEPS', 'ARCHIVES', 'EXTRA_MODULES'
	, 'DYNAMIC_LIBS', 'SHARED_LIBS', 'DYNAMIC_LIBS_GROUPED', 'TEST_LIST'
	, 'GD_FLAGS'
	, 'GD_LIBS'
	, 'SKIP_LIBS'
	, 'EXTRA_FLAGS'
	, 'PRE_JS_FILES'
	, 'BRIDGE_MODULES'
];

/**
 * Evaluates extension selection without reading a profile or invoking build targets.
 * @param {string} file Package Make fragment.
 * @param {string} flag Extension flag without WITH_.
 * @param {string} value Requested mode.
 * @param {string} source Where Make receives the flag.
 * @returns {string} Effective mode, selected build inputs, and test inventory.
 */
function configure(file, flag, value, source)
{
	const name = `WITH_${flag}`;
	const defaults = {
		PHP_VERSION: '8.4', WITH_LIBXML: 'dynamic', WITH_DOM: 'dynamic'
		, WITH_ZLIB: 'dynamic', WITH_VRZNO: 'static', WITH_GD: 'dynamic'
	};
	delete defaults[name];
	const env = {...process.env, MAKEFLAGS: '', MFLAGS: ''};
	delete env[name];
	const args = ['--no-print-directory', '-rR', '-f', '-'];
	if(source === 'command') args.push(`${name}=${value}`);
	else env[name] = value;
	if(source === 'environment-override') args.push('-e');
	args.push(...Object.entries(defaults).map(([key, setting]) => `${key}=${setting}`), 'inspect');
	const input = [
		`include packages/${file}.mak`
		, ...[name, ...inventory].map(key => `$(info ${key}=$(${key}))`)
		, '.PHONY: inspect', 'inspect: ; @:', ''
	].join('\n');
	return execFileSync('make', args, {cwd: root, env, input, encoding: 'utf8'});
}

for(const [file, flag, mode] of aliases)
{
	test(`WITH_${flag}=1 selects the same build inputs and tests as ${mode}`, () => {
		const expected = configure(file, flag, mode, 'command');
		for(const source of ['command', 'environment', 'environment-override'])
		{
			assert.equal(configure(file, flag, '1', source), expected, source);
		}
		assert.match(configure(file, flag, '0', 'command'), new RegExp(`^WITH_${flag}=0\\n`));
	});
}

test('PDO-PGlite shared fallback also normalizes command-line and environment overrides', () => {
	const expected = configure('pdo-pglite/pre', 'PDO_PGLITE', 'static', 'command');
	for(const source of ['command', 'environment', 'environment-override'])
	{
		assert.equal(configure('pdo-pglite/pre', 'PDO_PGLITE', 'shared', source), expected, source);
	}
});

test('combined compatibility aliases preserve the full Make build configuration', () => {
	const input = [
		...[...aliases.map(([, flag]) => `WITH_${flag}`), ...inventory].map(key => `$(info ${key}=$(${key}))`)
		, '.PHONY: inspect', 'inspect: ; @:', ''
	].join('\n');
	const configureAll = compatibility => execFileSync('make', [
		'--no-print-directory', '-rR', '-f', 'Makefile', '-f', '-'
		, 'ENV_FILE=.github/.env_8.4.dynamic.ci'
		, ...aliases.map(([, flag, mode]) => `WITH_${flag}=${compatibility ? '1' : mode}`)
		, 'inspect'
	], {cwd: root, input, encoding: 'utf8', env: {...process.env, MAKEFLAGS: '', MFLAGS: ''}});
	assert.equal(configureAll(true), configureAll(false));
});
