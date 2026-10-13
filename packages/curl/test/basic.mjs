import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import http from 'node:http';
import { env } from 'node:process';
import { PhpNode } from '../../../test/lib/PhpNode.mjs';

import curl from 'php-wasm-curl';

let active = 0;
let peak = 0;

// Deno's node:test has no before()/after(); an unref'd server ends with the process.
const server = http.createServer((request, response) => {
	const url = new URL(request.url, 'http://localhost');
	const chunks = [];
	request.on('data', chunk => chunks.push(chunk));
	request.on('end', () => {
		const body = Buffer.concat(chunks).toString('latin1');
		const json = data => {
			response.writeHead(200, {'Content-Type': 'application/json'});
			response.end(JSON.stringify(data));
		};

		switch(url.pathname)
		{
			case '/hello':
				response.writeHead(200, {'Content-Type': 'text/plain', 'X-Test': 'yes'});
				response.end('Hello, curl!');
				break;
			case '/echo':
				json({method: request.method, headers: request.headers, body});
				break;
			case '/redirect':
				response.writeHead(302, {Location: '/hello'});
				response.end();
				break;
			case '/missing':
				response.writeHead(404, {'Content-Type': 'text/plain'});
				response.end('not here');
				break;
			case '/hang':
				setTimeout(() => response.end(), 2000);
				break;
			case '/slow':
				active++;
				peak = Math.max(peak, active);
				setTimeout(() => {
					active--;
					response.writeHead(200, {'Content-Type': 'text/plain'});
					response.end(url.searchParams.get('id') ?? 'slow');
				}, Number(url.searchParams.get('ms') ?? 300));
				break;
			default:
				response.writeHead(500);
				response.end();
		}
	});
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
server.unref();
const base = `http://127.0.0.1:${server.address().port}`;

const runPhp = async code => {
	const php = env.WITH_CURL === 'dynamic'
		? new PhpNode({sharedLibs: [curl]})
		: new PhpNode;

	let stdOut = '', stdErr = '';
	php.addEventListener('output', event => event.detail.forEach(line => void (stdOut += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stdErr += line)));

	await php.binary;
	const exitCode = await php.run(`<?php $base = ${JSON.stringify(base)};\n${code}`);
	return {exitCode, stdOut, stdErr};
};

test('Curl extension is enabled.', async () => {
	const {exitCode, stdOut, stdErr} = await runPhp(`
		var_dump(extension_loaded('curl'));
		echo curl_version()['version'];
	`);
	assert.equal(exitCode, 0);
	assert.equal(stdErr, '');
	assert.match(stdOut, /^bool\(true\)\n\d+\.\d+\.\d+-php-wasm-fetch$/);
});

test('GET with CURLOPT_RETURNTRANSFER and curl_getinfo().', async () => {
	const {stdOut, stdErr} = await runPhp(`
		$ch = curl_init("$base/hello");
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		$body = curl_exec($ch);
		$info = curl_getinfo($ch);
		echo json_encode([$body, $info['http_code'], $info['content_type'], $info['size_download'], $info['url']]);
	`);
	assert.equal(stdErr, '');
	assert.deepEqual(JSON.parse(stdOut), ['Hello, curl!', 200, 'text/plain', 12, `${base}/hello`]);
});

test('CURLOPT_HEADER and CURLOPT_HEADERFUNCTION receive the response headers.', async () => {
	const {stdOut} = await runPhp(`
		$lines = [];
		$ch = curl_init("$base/hello");
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_HEADER => true,
			CURLOPT_HEADERFUNCTION => function($ch, $line) use (&$lines) { $lines[] = trim($line); return strlen($line); },
		]);
		$response = curl_exec($ch);
		$size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
		echo json_encode([substr($response, $size), $lines[0], in_array('x-test: yes', $lines), end($lines)]);
	`);
	assert.deepEqual(JSON.parse(stdOut), ['Hello, curl!', 'HTTP/1.1 200 OK', true, '']);
});

test('POST a string body with custom headers.', async () => {
	const {stdOut} = await runPhp(`
		$ch = curl_init("$base/echo");
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_POSTFIELDS => json_encode(['a' => 1]),
			CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Custom: one', 'Expect:'],
			CURLOPT_USERAGENT => 'php-wasm-test',
		]);
		echo curl_exec($ch);
	`);
	const echo = JSON.parse(stdOut);
	assert.equal(echo.method, 'POST');
	assert.equal(echo.body, '{"a":1}');
	assert.equal(echo.headers['content-type'], 'application/json');
	assert.equal(echo.headers['x-custom'], 'one');
	assert.equal(echo.headers['user-agent'], 'php-wasm-test');
	assert.equal(echo.headers.expect, undefined);
});

test('POST an array with a CURLFile as multipart/form-data.', async () => {
	const {stdOut, stdErr} = await runPhp(`
		file_put_contents('/tmp/upload.txt', 'file contents');
		$ch = curl_init("$base/echo");
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_POSTFIELDS => ['field' => 'value', 'upload' => new CURLFile('/tmp/upload.txt', 'text/plain', 'notes.txt')],
		]);
		echo curl_exec($ch);
	`);
	assert.equal(stdErr, '');
	const echo = JSON.parse(stdOut);
	assert.match(echo.headers['content-type'], /^multipart\/form-data; boundary=/);
	assert.match(echo.body, /name="field"\r\n\r\nvalue\r\n/);
	assert.match(echo.body, /name="upload"; filename="notes.txt"\r\nContent-Type: text\/plain[^\r]*\r\n\r\nfile contents\r\n/);
});

test('CURLOPT_CUSTOMREQUEST and basic authentication.', async () => {
	const {stdOut} = await runPhp(`
		$ch = curl_init("$base/echo");
		curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => 'DELETE', CURLOPT_USERPWD => 'user:secret']);
		echo curl_exec($ch);
	`);
	const echo = JSON.parse(stdOut);
	assert.equal(echo.method, 'DELETE');
	assert.equal(echo.headers.authorization, 'Basic dXNlcjpzZWNyZXQ=');
});

test('Redirects are reported or followed.', async () => {
	const {stdOut} = await runPhp(`
		$ch = curl_init("$base/redirect");
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_exec($ch);
		$stopped = [curl_getinfo($ch, CURLINFO_HTTP_CODE), curl_getinfo($ch, CURLINFO_REDIRECT_URL)];
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
		$body = curl_exec($ch);
		echo json_encode([$stopped, $body, curl_getinfo($ch, CURLINFO_EFFECTIVE_URL), curl_getinfo($ch, CURLINFO_REDIRECT_COUNT)]);
	`);
	assert.deepEqual(JSON.parse(stdOut), [[302, `${base}/hello`], 'Hello, curl!', `${base}/hello`, 1]);
});

test('Errors map to libcurl error codes.', async () => {
	const {stdOut} = await runPhp(`
		$results = [];
		$ch = curl_init("$base/missing");
		curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FAILONERROR => true]);
		$results[] = [curl_exec($ch), curl_errno($ch), curl_error($ch)];
		$ch = curl_init("$base/hang");
		curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT_MS => 200]);
		$results[] = [curl_exec($ch), curl_errno($ch)];
		$ch = curl_init('ftp://example.com/');
		$results[] = [curl_exec($ch), curl_errno($ch)];
		echo json_encode($results);
	`);
	const [failed, timedOut, unsupported] = JSON.parse(stdOut);
	assert.deepEqual(failed, [false, 22, 'The requested URL returned error: 404']);
	assert.deepEqual(timedOut, [false, 28]);
	assert.deepEqual(unsupported, [false, 1]);
});

test('A refused connection gives CURLE_COULDNT_CONNECT.', async () => {
	const closed = http.createServer();
	await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
	const port = closed.address().port;
	await new Promise(resolve => closed.close(resolve));

	const {stdOut} = await runPhp(`
		$ch = curl_init('http://127.0.0.1:${port}/');
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		echo json_encode([curl_exec($ch), curl_errno($ch), curl_error($ch) !== '']);
	`);
	assert.deepEqual(JSON.parse(stdOut), [false, 7, true]);
});

test('curl_multi runs transfers concurrently.', async () => {
	peak = 0;
	const {stdOut, stdErr} = await runPhp(`
		$mh = curl_multi_init();
		$handles = [];
		foreach([0, 1, 2] as $id)
		{
			$ch = curl_init("$base/slow?ms=300&id=$id");
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			curl_multi_add_handle($mh, $ch);
			$handles[] = $ch;
		}
		do {
			$status = curl_multi_exec($mh, $running);
			if($running) curl_multi_select($mh);
		} while($running && $status === CURLM_OK);
		$done = 0;
		while($message = curl_multi_info_read($mh))
		{
			$done += $message['msg'] === CURLMSG_DONE && $message['result'] === CURLE_OK;
		}
		echo json_encode([$done, array_map('curl_multi_getcontent', $handles)]);
		foreach($handles as $ch) curl_multi_remove_handle($mh, $ch);
		curl_multi_close($mh);
	`);
	assert.equal(stdErr, '');
	assert.deepEqual(JSON.parse(stdOut), [3, ['0', '1', '2']]);
	assert.equal(peak, 3);
});

test('CURLINFO_HEADER_OUT, curl_escape and curl_unescape.', async () => {
	const {stdOut} = await runPhp(`
		$ch = curl_init("$base/hello");
		curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLINFO_HEADER_OUT => true]);
		curl_exec($ch);
		$sent = curl_getinfo($ch, CURLINFO_HEADER_OUT);
		$escaped = curl_escape($ch, 'a b&c/ü');
		echo json_encode([str_starts_with($sent, "GET /hello HTTP/1.1\\r\\n"), $escaped, curl_unescape($ch, $escaped)]);
	`);
	assert.deepEqual(JSON.parse(stdOut), [true, 'a%20b%26c%2F%C3%BC', 'a b&c/ü']);
});
