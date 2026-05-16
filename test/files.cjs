const { test } = require('node:test');
const { strict: assert } = require('node:assert');

const { PhpNode } = require('./lib/PhpNode.cjs');

test('Can read files from JS through the FS interface', async () => {
	const php = new PhpNode({ persist: { mountPath: '/persist', localPath: process.cwd() + '/test/' } });
	const contents = new TextDecoder().decode(await php.readFile('/persist/test-content.txt'));

	assert.equal(contents, `Hello, world!\n`);
});

test('Can write files from JS through the FS interface', async () => {
	const php = new PhpNode({ persist: { mountPath: '/persist', localPath: process.cwd() + '/test/' } });

	await php.writeFile('/persist/test-content-2.txt', `WRITE TEST\n`);

	const aboutPath = await php.analyzePath('/persist/test-content-2.txt');
	assert.equal(aboutPath.exists, true);

	const contents = new TextDecoder().decode(await php.readFile('/persist/test-content-2.txt'));
	assert.equal(contents, `WRITE TEST\n`);
});

test('Can delete files from JS through the FS interface', async () => {
	const php = new PhpNode({ persist: { mountPath: '/persist', localPath: process.cwd() + '/test/' } });

	await php.writeFile('/persist/test-content-2.txt', `WRITE TEST\n`);
	await php.unlink('/persist/test-content-2.txt');

	const aboutPath = await php.analyzePath('/persist/test-content-2.txt');
	assert.equal(aboutPath.exists, false);
});

test('Can create & delete directories through the FS interface', async () => {
	const php = new PhpNode({ persist: { mountPath: '/persist', localPath: process.cwd() + '/test/' } });

	await php.mkdir('/persist/test-dir');

	const aboutPathBefore = await php.analyzePath('/persist/test-dir');
	assert.equal(aboutPathBefore.exists, true);

	await php.rmdir('/persist/test-dir');

	const aboutPathAfter = await php.analyzePath('/persist/test-dir');
	assert.equal(aboutPathAfter.exists, false);
});
