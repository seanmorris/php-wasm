import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpNode as BasePhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from '../../../test/lib/node-runtime-options.mjs';
import { withHttpServer } from '../../../test/lib/http-server.mjs';

class PhpNode extends BasePhpNode
{
	constructor(args = {})
	{
		super(nodeRuntimeOptions(args));
	}
}

const capture = php => {
	let stderr = '';
	php.addEventListener('error', event => event.detail.forEach(line => void (stderr += line)));
	return () => stderr;
};

const handleRequest = async (request, response) => {
	if(request.url === '/ok')
	{
		response.setHeader('X-Vrzno-Test', 'yes');
		response.end('local response');
		return;
	}

	if(request.url === '/echo')
	{
		// Deno 2.5.6 can stall when draining a bodyless GET request.
		const chunks = [];
		for await(const chunk of request)
		{
			chunks.push(chunk);
		}

		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify({
			method: request.method,
			header: request.headers['x-vrzno-test'],
			body: Buffer.concat(chunks).toString(),
		}));
		return;
	}

	if(request.url === '/drop')
	{
		// Truncate the body: Deno 2.5.6's HTTP socket.destroy() does not abort fetch.
		response.writeHead(200, {'Content-Length': '100', Connection: 'close'});
		response.end('partial');
		return;
	}

	response.statusCode = 404;
	response.statusMessage = 'Missing';
	response.setHeader('X-Vrzno-Missing', 'yes');
	response.end('missing response');
};

test('Fetch stream wrapper returns local content and response headers', () => withHttpServer(handleRequest, async origin => {
	const php = new PhpNode();
	await php.binary;

	const result = await php.x`(function () {
		$body = file_get_contents(${`${origin}/ok`});
		return ['body' => $body, 'headers' => $http_response_header];
	})()`;

	assert.equal(result.body, 'local response');
	assert.ok([...result.headers].some(header => header.toLowerCase() === 'x-vrzno-test: yes'));
}));

test('Fetch stream wrapper forwards method, headers, and binary-safe content', () => withHttpServer(handleRequest, async origin => {
	const php = new PhpNode();
	const stderr = capture(php);
	await php.binary;

	const json = await php.x`(function () {
		$context = stream_context_create(['http' => [
			'method' => 'POST',
			'header' => ['Content-Type: text/plain', 'X-Vrzno-Test: forwarded'],
			'content' => 'hello' . chr(0) . 'world',
		]]);
		return file_get_contents(${`${origin}/echo`}, false, $context);
	})()`;

	assert.notEqual(json, undefined, stderr());
	assert.deepEqual(JSON.parse(json), {
		method: 'POST',
		header: 'forwarded',
		body: 'hello\0world',
	});
}));

test('Fetch stream wrapper follows ignore_errors for HTTP failures', () => withHttpServer(handleRequest, async origin => {
	const php = new PhpNode();
	await php.binary;

	const result = await php.x`(function () {
		$body = @file_get_contents(${`${origin}/missing`});
		$defaultHeaders = $http_response_header;
		$context = stream_context_create(['http' => ['ignore_errors' => true]]);
		$ignoredBody = file_get_contents(${`${origin}/missing`}, false, $context);
		return [
			'body' => $body,
			'defaultHeaders' => $defaultHeaders,
			'ignoredBody' => $ignoredBody,
			'ignoredHeaders' => $http_response_header,
		];
	})()`;

	assert.equal(result.body, false);
	assert.match(result.defaultHeaders[0], /^HTTP\/1\.1 404 /);
	assert.equal(result.ignoredBody, 'missing response');
	assert.match(result.ignoredHeaders[0], /^HTTP\/1\.1 404 /);
}));

test('Fetch stream wrapper reports network failures without crashing', () => withHttpServer(handleRequest, async origin => {
	const php = new PhpNode();
	await php.binary;

	const result = await php.x`@file_get_contents(${`${origin}/drop`})`;
	assert.equal(result, false);
}));
