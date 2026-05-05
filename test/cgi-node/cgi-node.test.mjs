import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const version = process.env.PHP_VERSION ?? '8.4';
const baseUrl = `http://127.0.0.1:${Number(process.env.CGI_NODE_TEST_PORT ?? 9001)}/php-wasm/cgi-bin/test`;

test('renders the CGI hello world demo', async () => {
	const phpOutput = await (await fetch(`${baseUrl}/hello-world.php`)).text();

	assert.equal(phpOutput, 'Hello, world!\n');
});

test('serves the expected PHP version through CGI', async () => {
	const phpOutput = await (await fetch(`${baseUrl}/version.php`)).text();

	assert.equal(phpOutput, version);
});
