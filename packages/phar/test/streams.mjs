import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {gzipSync} from 'node:zlib';
import Phar from 'php-wasm-phar';
import Zlib from 'php-wasm-zlib';
import {PhpNode} from '../../../test/lib/PhpNode.mjs';

/**
 * Mounts private archive fixtures and captures PHP diagnostics for one test.
 * @param {string} ini Startup INI overrides.
 * @param {(run: (code: string, expected: string) => Promise<void>) => Promise<void>} callback Test using the checked script runner.
 * @returns {Promise<void>} Completes after the test and fixture cleanup.
 */
const withPhar = async (ini, callback) => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'php-phar-streams-'));

	try
	{
		const php = new PhpNode({
			version: process.env.PHP_VERSION ?? '8.4'
			, sharedLibs: [
				...(['1', 'dynamic'].includes(process.env.WITH_ZLIB) ? [Zlib] : [])
				, ...(['1', 'dynamic'].includes(process.env.WITH_PHAR) ? [Phar] : [])
			]
			, persist: [{mountPath: '/test-phar', localPath: directory}]
			, ini
		});
		let stdout = '', stderr = '';
		php.addEventListener('output', event => stdout += event.detail.join(''));
		php.addEventListener('error', event => stderr += event.detail.join(''));

		for(const name of ['sample.phar', 'streams.php'])
		{
			await php.writeFile(`/test-phar/${name}`, await readFile(new URL(`./fixtures/${name}`, import.meta.url)));
		}
		const archive = await readFile(new URL('./fixtures/sample.phar', import.meta.url));
		await php.writeFile('/test-phar/sample.phar.gz', gzipSync(archive));

		await callback(async (code, expected) => {
			stdout = stderr = '';
			const exitCode = await php.run(code);
			assert.equal(exitCode, 0, stdout + stderr);
			assert.equal(stderr, '');
			assert.equal(stdout, expected);
		});
	}
	finally
	{
		await rm(directory, {recursive: true, force: true});
	}
};

test('Phar streams support file operations and report invalid archive access', () => withPhar('phar.readonly=0', async run => {
	await run('<?php require "/test-phar/streams.php";', 'phar-streams-ok\n');
	await run('<?php echo file_get_contents("phar:///test-phar/sample.phar/hello.txt");', 'hello archive\n');
}));

test('Phar keeps its default readonly policy', () => withPhar('', async run => {
	await run(`<?php
		set_error_handler(function ($severity, $message) { throw new ErrorException($message); });
		try {
			file_put_contents('phar:///test-phar/sample.phar/new.txt', 'blocked');
		} catch (ErrorException $error) {
			echo ini_get('phar.readonly') === '1' && str_contains($error->getMessage(), 'phar.readonly')
				&& !file_exists('phar:///test-phar/sample.phar/new.txt') ? 'readonly-ok' : $error->getMessage();
		}
	`, 'readonly-ok');
}));

test('Phar gzip streams use the enabled zlib extension', {skip: process.env.WITH_ZLIB === '0'}, () => withPhar('phar.readonly=0', async run => {
	await run(`<?php
		echo file_get_contents('phar:///test-phar/sample.phar.gz/hello.txt');
		$archive = new Phar('/test-phar/compressed.phar');
		$archive['hello.txt'] = 'compressed entry';
		$archive->compressFiles(Phar::GZ);
		echo file_get_contents('phar:///test-phar/compressed.phar/hello.txt');
	`, 'hello archive\ncompressed entry');
}));
