import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhpCliNode } from '../../source/PhpCliNode.mjs';
import { PhpCliWeb } from '../../source/PhpCliWeb.mjs';

// Exercise the real public run/queue methods without compiling native PHP.
const createCli = (Wrapper, ccall) => Object.assign(Object.create(Wrapper.prototype), {
	queue: []
	, autoTransaction: false
	, flush() {}
	, binary: Promise.resolve({
		lengthBytesUTF8: text => text.length
		, _malloc: () => 0
		, stringToUTF8() {}
		, setValue() {}
		, ccall
	})
});

for(const Wrapper of [PhpCliNode, PhpCliWeb])
{
	test(`${Wrapper.name} resolves numeric native returns and exit statuses`, async () => {
		assert.equal(await createCli(Wrapper, () => 42).run(['-v']), 42);
		assert.equal(await createCli(Wrapper, () => { throw {status: 7}; }).run(), 7);
	});
}

test('Node CLI preserves its undefined result for errors without an exit status', async () => {
	assert.equal(await createCli(PhpCliNode, () => { throw new Error('No exit status'); }).run(), undefined);
});

test('browser CLI rejects errors without an exit status', async () => {
	const failure = new Error('No exit status');
	await assert.rejects(createCli(PhpCliWeb, () => { throw failure; }).run(), error => error === failure);
});
