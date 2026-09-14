import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode as BasePhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';

class PhpNode extends BasePhpNode
{
	constructor(args = {})
	{
		super(nodeRuntimeOptions(args));
	}
}

const capture = php => {
	let stdout = '';
	let stderr = '';
	php.addEventListener('output', event => event.detail.forEach(line => void (stdout += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stderr += line)));
	return {
		stdout: () => stdout,
		stderr: () => stderr,
	};
};

test('Expression results release their PHP owner with the JavaScript proxy', async () => {
	const php = new PhpNode();
	const output = capture(php);
	const module = await php.binary;
	const baseline = module.vrznoOwnershipStats().outstanding;
	const value = await php.x`new class {
		public function __destruct() { echo "released\n"; }
	}`;

	assert.equal(output.stdout(), '');
	// Deterministically simulate proxy finalization without relying on JavaScript GC.
	assert.equal(module.ownedZvalRegistry.release(value), true);
	await php.exec('gc_collect_cycles();');

	assert.equal(output.stdout(), 'released\n');
	assert.equal(output.stderr(), '');
	assert.equal(module.vrznoOwnershipStats().outstanding, baseline);
});

test('Callback arguments and return values remain stable under repetition', async () => {
	const php = new PhpNode();
	const module = await php.binary;
	const callback = await php.x`fn(int $value): int => $value + 1`;
	const baseline = module.vrznoOwnershipStats().outstanding;

	for(let i = 0; i < 1000; i++)
	{
		assert.equal(callback(i), i + 1);
	}

	assert.equal(module.vrznoOwnershipStats().outstanding, baseline);
});

test('Refresh releases owned PHP values and invalidates stale proxies', async () => {
	const php = new PhpNode();
	const module = await php.binary;
	const callback = await php.x`fn(int $value): int => $value + 1`;
	const value = await php.x`['answer' => 42]`;

	assert.equal(callback(1), 2);
	assert.equal(value.answer, 42);
	assert.ok(module.vrznoOwnershipStats().outstanding >= 2);

	await php.refresh();

	assert.equal(module.vrznoOwnershipStats().outstanding, 0);
	assert.equal(module.vrznoOwnershipStats().targets, 1);
	assert.throws(() => callback(1), {
		name: 'ReferenceError',
		message: 'Vrzno value belongs to a previous PHP runtime.',
	});
	assert.throws(() => value.answer, {
		name: 'ReferenceError',
		message: 'Vrzno value belongs to a previous PHP runtime.',
	});
});

test('Legacy timeouts retain bound callables until invocation', async () => {
	const php = new PhpNode();
	const output = capture(php);
	await php.binary;
	php.shared.delay = {
		then(resolve) {
			setTimeout(resolve, 25);
		},
	};

	const exitCode = await php.run(`<?php
		class VrznoTimeoutFixture {
			public function __construct(private string $value) {}
			public function emit(): void { echo $this->value; }
		}

		$fixture = new VrznoTimeoutFixture('called');
		vrzno_timeout(0, [$fixture, 'emit']);
		vrzno_await(vrzno_shared('delay'));
	`);

	assert.equal(exitCode, 0);
	assert.equal(output.stdout(), 'called');
	assert.equal(output.stderr(), '');
});
