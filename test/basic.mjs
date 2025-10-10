import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode } from '../packages/php-wasm/PhpNode.mjs';

test('Can run PHP', async () => {
	const php = new PhpNode({});

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php 2 + 2;`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, '');
	assert.equal(stdErr, '');
});

test('Returns 0 as an exit code: User report', async () => {
	const php = new PhpNode({ persist: {mountPath: '/host' , localPath: '/'} });

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(
		'<?php function main(): int { echo "Hello World" . PHP_EOL; return 0;}; exit(main());',
	);

	assert.equal(stdOut, 'Hello World\n');
	assert.equal(stdErr, '');
	assert.equal(exitCode, 0);
});

test('Returns 0 as an exit code: Distilled', async () => {
	const php = new PhpNode({ persist: {mountPath: '/host' , localPath: '/'} });

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(
		'<?php exit(0);',
	);

	assert.equal(stdOut, '');
	assert.equal(stdErr, '');
	assert.equal(exitCode, 0);
});

test('Can print to STDOUT', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php echo "Hello, World!";`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, 'Hello, World!');
	assert.equal(stdErr, '');
});

test('Can print to STDERR', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php file_put_contents("php://stderr", "Hello, World!");`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, '');
	assert.equal(stdErr, 'Hello, World!');
});

test('Can take input on STDIN', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '', stdin = 'This is a string of data provided on STDIN.';

	php.inputString(stdin);

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php echo file_get_contents('php://stdin');`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, stdin);
	assert.equal(stdErr, '');
});

const defaultVersion = process.env.PHP_VERSION ?? '8.4';
const defaultVariant = process.env.PHP_VARIANT ?? '';

test(`Correct version is running (${defaultVersion}${defaultVariant})`, async () => {
	const php = new PhpNode();
	
	let stdOut = '', stdErr = '';
	
	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));
	
	await php.binary;
	
	const exitCode = await php.run(`<?php echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, defaultVersion);
	assert.equal(stdErr, '');
});

test('Can maintain memory between executions', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;
	await php.run(`<?php $i = 100;`);
	await php.run(`<?php $i++;`);
	await php.run(`<?php echo $i . PHP_EOL;`);

	assert.equal(stdOut, `101\n`);
	assert.equal(stdErr, '');
});

test('Can refresh memory between executions', async () => {
	const php = new PhpNode({});

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;
	await php.run(`<?php $i = 100;`);
	await php.run(`<?php $i++;`);
	await php.refresh();
	await php.run(`<?php ini_set('display_errors', 1); @error_reporting(E_ALL | E_STRICT); var_dump($i) . PHP_EOL;`);

	assert.equal(stdOut, `\nWarning: Undefined variable $i in php-wasm run script on line 1\nNULL\n`);
	assert.equal(stdErr, '');

});

test('Can read files from the local FS through PHP functions', async () => {
	const php = new PhpNode( { persist: { mountPath: '/persist', localPath: process.cwd() + '/test/' } } );

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;
	await php.run(`<?php echo file_get_contents('/persist/test-content.txt');`);

	assert.equal(stdOut, `Hello, world!\n`);
	assert.equal(stdErr, '');
});

test('PIB extension is enabled.', async () => {
	const php = new PhpNode();

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(`<?php var_dump(extension_loaded('pib'));`);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `bool(true)\n`);
	assert.equal(stdErr, '');
});

test('Directories are pre-created for deeply nested files', async() => {
	const php = new PhpNode({files: [
		{
			name: 'hello-world.txt',
			parent: '/deeply/nested/dir/path',
			url: new URL('./hello-world.txt', import.meta.url)
		}
	]});

	let stdOut = '', stdErr = '';

	php.addEventListener('output', (event) => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error',  (event) => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;

	const exitCode = await php.run(
		`<?php var_dump(file_get_contents('/deeply/nested/dir/path/hello-world.txt'));`
	);

	assert.equal(exitCode, 0);
	assert.equal(stdOut, `string(13) "Hello, World!"\n`);
	assert.equal(stdErr, '');
});
