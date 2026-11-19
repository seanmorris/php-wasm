import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = {...process.env, MAKEFLAGS: '', MFLAGS: ''};

// PHP's generated Makefile, reduced to what decides a source file's flags.
const phpMakefile = [
	'CFLAGS_CLEAN = -fno-common -Wall -g -O2 -ffp-contract=off -fvisibility=hidden'
	, 'CXXFLAGS_CLEAN = -g -O2'
	, 'EXTRA_LIBS ='
	, '.PHONY: flags Zend/zend_compile.lo Zend/zend_execute.lo'
	, 'flags: Zend/zend_compile.lo Zend/zend_execute.lo'
	, '\t@echo "C: $(CFLAGS_CLEAN) $(EXTRA_CFLAGS)"'
	, '\t@echo "CXX: $(CXXFLAGS_CLEAN) $(EXTRA_CXXFLAGS)"'
	, 'Zend/zend_compile.lo Zend/zend_execute.lo:'
	, '\t@echo "$@: $(CFLAGS_CLEAN) $(EXTRA_CFLAGS)"'
	, ''
].join('\n');

/**
 * Reads the flags PHP's sources are compiled with, through the real Makefile and php.mk.
 * @param {string[]} settings Make variable assignments for the outer build.
 * @returns {{c: string[], cxx: string[], compiler: string[], executor: string[]}} Flags in command-line
 * order: for any C source, any C++ source, PHP's compiler and PHP's executor.
 */
function compileFlags(settings = [])
{
	const buildFlags = execFileSync('make', [
		'--no-print-directory'
		, 'ENV_FILE=.github/.env_8.4.static.ci'
		, ...settings
		, '--eval'
		, '__php_build_flags:;@: $(info $(BUILD_FLAGS))'
		, '__php_build_flags'
	], {cwd: root, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}).trim();

	assert.match(buildFlags, /^-f \.\.\/\.\.\/php\.mk /);

	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-wasm-optimization-'));

	try
	{
		fs.writeFileSync(path.join(directory, 'Makefile'), phpMakefile);

		// The flags are written for a shell, as the build's recipes pass them.
		const command = [
			'make --no-print-directory'
			, buildFlags.replace(/^-f \.\.\/\.\.\/php\.mk /, `-f '${path.join(root, 'php.mk')}' `)
			, 'flags'
		].join(' ');
		const output = execFileSync('sh', ['-c', command], {cwd: directory, env, encoding: 'utf8'});

		const line = prefix => output.split('\n').find(text => text.startsWith(prefix)).slice(prefix.length).trim().split(/\s+/);

		return {
			c: line('C: ')
			, cxx: line('CXX: ')
			, compiler: line('Zend/zend_compile.lo: ')
			, executor: line('Zend/zend_execute.lo: ')
		};
	}
	finally
	{
		fs.rmSync(directory, {recursive: true, force: true});
	}
}

const levels = flags => flags.filter(flag => /^-O/.test(flag));

for(const level of ['3', '2', 's', 'z', '0'])
{
	test(`PHP's sources are compiled at -O${level} when OPTIMIZE=${level}`, () => {
		const {c, cxx} = compileFlags([`OPTIMIZE=${level}`]);

		// Clang takes the last level. A missing one means -O0, and under LTO
		// "optnone" on every function, which the link cannot undo.
		assert.deepEqual(levels(c), [`-O${level}`]);
		assert.equal(levels(cxx).at(-1), `-O${level}`);
	});
}

test("PHP's debug symbols follow the build's own setting, not configure's -g", () => {
	assert.ok(!compileFlags().c.includes('-g'));
});

test("PHP's compiler alone stays unoptimised, to keep its recursion off the engine's stack", () => {
	const {c, compiler, executor} = compileFlags(['OPTIMIZE=3']);

	assert.equal(levels(compiler).at(-1), '-O0');
	assert.equal(levels(executor).at(-1), '-O3');
	assert.deepEqual(executor, c);
});

test('PHP_COMPILER_CFLAGS= optimises the compiler like everything else', () => {
	const {c, compiler} = compileFlags(['OPTIMIZE=3', 'PHP_COMPILER_CFLAGS=']);

	assert.deepEqual(compiler, c);
});

test('a level in EXTRA_CFLAGS overrides the default', () => {
	const {c, cxx} = compileFlags(['OPTIMIZE=3', 'EXTRA_CFLAGS=-O1']);

	assert.equal(levels(c).at(-1), '-O1');
	assert.equal(levels(cxx).at(-1), '-O1');
});
