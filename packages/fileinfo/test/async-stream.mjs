import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';
import { env } from 'node:process';
import fileinfo from 'php-wasm-fileinfo';

test('finfo_file reads streams whose reads await JavaScript', {timeout: 10000}, async () => {
	let waits = 0;
	let stdout = '', stderr = '';
	const php = new PhpNode(nodeRuntimeOptions({
		sharedLibs: env.WITH_FILEINFO === 'dynamic' ? [fileinfo] : []
		, waitForRead: async () => {
			await Promise.resolve();
			++waits;
		}
	}));
	php.addEventListener('output', event => event.detail.forEach(line => stdout += line));
	php.addEventListener('error', event => event.detail.forEach(line => stderr += line));
	await php.binary;

	const result = await php.run(`<?php
		class AsyncStream
		{
			const DATA = "%PDF-1.4\\n%%EOF\\n";
			public $context;
			private $position = 0;

			public function stream_open($path, $mode, $options, &$openedPath) { return true; }
			public function stream_read($count)
			{
				vrzno_await(vrzno_env('waitForRead')());
				$chunk = substr(self::DATA, $this->position, $count);
				$this->position += strlen($chunk);
				return $chunk;
			}
			public function stream_cast($castAs) { return false; }
			public function stream_eof() { return $this->position >= strlen(self::DATA); }
			public function stream_stat() { return ['mode' => 0100644, 'size' => strlen(self::DATA)]; }
		}
		stream_wrapper_register('async', AsyncStream::class);
		echo finfo_file(finfo_open(FILEINFO_MIME_TYPE), 'async://document'), "\\n";
	`);

	assert.equal(result, 0, stderr || stdout);
	assert.ok(waits > 0);
	assert.equal(stdout, 'application/pdf\n');
	assert.equal(stderr, '');
	assert.equal(await php.run('<?php echo "next call";'), 0);
	assert.ok(stdout.endsWith('next call'));
});
