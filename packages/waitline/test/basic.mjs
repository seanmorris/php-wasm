import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpCliNode } from '../../php-cli-wasm/PhpCliNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';

const version = process.env.PHP_VERSION ?? '8.4';

const createPhp = args => new PhpCliNode(nodeRuntimeOptions({
	runtime: 'cli'
	, version
	, ...args
}));

const captureOutput = php => {
	let stdout = '';
	let stderr = '';

	php.addEventListener('output', event => event.detail.forEach(part => void (stdout += part)));
	php.addEventListener('error', event => event.detail.forEach(part => void (stderr += part)));

	return {
		stdout: () => stdout
		, stderr: () => stderr
	};
};

test('waitline exposes the readline API and persistent history', async () => {
	const code = String.raw`
		$functions = [
			'readline',
			'readline_info',
			'readline_add_history',
			'readline_clear_history',
			'readline_list_history',
			'readline_read_history',
			'readline_write_history',
			'readline_completion_function',
			'readline_callback_handler_install',
			'readline_callback_read_char',
			'readline_callback_handler_remove',
			'readline_redisplay',
			'readline_on_new_line',
		];
		$historyFile = tempnam(sys_get_temp_dir(), 'waitline.');

		readline_clear_history();
		readline_add_history('first');
		readline_add_history('Grüße 🌍');
		readline_add_history('');

		$result = [
			'extension' => extension_loaded('waitline'),
			'library' => READLINE_LIB,
			'functions' => array_map('function_exists', $functions),
			'always_true_return_types' => array_map(
				static fn (string $name): string => (string) (new ReflectionFunction($name))->getReturnType(),
				['readline_add_history', 'readline_clear_history', 'readline_callback_handler_install']
			),
			'old_buffer' => readline_info('line_buffer', 'buffer'),
			'line_buffer' => readline_info('line_buffer'),
			'completion' => readline_completion_function(static fn (): array => []),
			'callback_install' => readline_callback_handler_install('', static function (): void {}),
			'callback_remove' => readline_callback_handler_remove(),
			'callback_remove_again' => readline_callback_handler_remove(),
			'history_write' => readline_write_history($historyFile),
		];

		readline_clear_history();
		$result['history_read'] = readline_read_history($historyFile);
		$result['history'] = readline_list_history();
		unlink($historyFile);

		echo json_encode($result, JSON_UNESCAPED_UNICODE);
	`;
	const php = createPhp({code});
	const output = captureOutput(php);

	assert.equal(await php.run(), 0);
	assert.equal(output.stderr(), '');
	const alwaysTrueReturn = version === '8.5' ? 'true' : 'bool';

	assert.deepEqual(JSON.parse(output.stdout()), {
		extension: true
		, library: 'waitline'
		, functions: Array(13).fill(true)
		, always_true_return_types: Array(3).fill(alwaysTrueReturn)
		, old_buffer: ''
		, line_buffer: 'buffer'
		, completion: true
		, callback_install: true
		, callback_remove: true
		, callback_remove_again: false
		, history_write: true
		, history_read: true
		, history: ['first', 'Grüße 🌍', '']
	});
});

test('readline consumes php-cli-wasm line input, including Unicode and blank lines', {timeout: 10_000}, async () => {
	const code = String.raw`
		var_dump(readline('Prompt: '));
		var_dump(readline('Blank: '));
		readline_callback_handler_install('Callback: ', static function ($line): void {
			var_dump($line);
			readline_callback_handler_remove();
		});
		readline_callback_read_char();
	`;
	const php = createPhp({code});
	const output = captureOutput(php);
	const lines = ['hello 🌍', '', 'callback line'];
	const prompts = [];

	php.addEventListener('stdin-request', event => {
		prompts.push(event.detail.prompt);
		const line = lines.shift();

		if(line !== undefined)
		{
			void php.provideInput(line);
		}
	});

	assert.equal(await php.run(), 0);
	assert.equal(output.stderr(), '');
	assert.equal(
		output.stdout()
		, 'string(10) "hello 🌍"\n'
			+ 'string(0) ""\n'
			+ 'string(13) "callback line"\n'
	);
	assert.deepEqual(lines, []);
	assert.deepEqual(prompts, ['Prompt: ', 'Blank: ', 'Callback: ']);
});

test('the interactive CLI continues after a blank line and exits cleanly', {timeout: 10_000}, async () => {
	const php = createPhp({interactive: true});
	const output = captureOutput(php);
	const lines = [
		'echo "first\\n";'
		, ''
		, 'echo "second\\n";'
		, 'exit'
	];
	const prompts = [];

	php.addEventListener('stdin-request', event => {
		prompts.push(event.detail.prompt);
		const line = lines.shift();

		if(line !== undefined)
		{
			void php.provideInput(line);
		}
	});

	assert.equal(await php.run(), 0);
	assert.equal(output.stderr(), '');
	assert.match(output.stdout(), /first\n/);
	assert.match(output.stdout(), /second\n/);
	assert.deepEqual(lines, []);
	assert.deepEqual(prompts, [null, null, null, null]);
});
