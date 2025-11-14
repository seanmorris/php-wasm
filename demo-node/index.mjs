#!/usr/bin/env node
import http from 'node:http';
import { PhpCgiNode } from 'php-cgi-wasm/PhpCgiNode.mjs';

const php = new PhpCgiNode({
	prefix: '/php-wasm/cgi-bin/'
	, docroot: '/persist/www'
	, persist: [
		{mountPath: '/persist' , localPath: './persist'}
		, {mountPath: '/config' , localPath: './config'}
	]
	, sharedLibs: [
		// await import('php-wasm-intl')
		// , await import('php-wasm-libxml')
		// , await import('php-wasm-phar')
		// , await import('php-wasm-mbstring')
		// , await import('php-wasm-openssl')
		// , await import('php-wasm-dom')
		// , await import('php-wasm-xml')
		// , await import('php-wasm-simplexml')
		// , await import('php-wasm-sqlite')
		// , await import('php-wasm-zlib')
		// , await import('php-wasm-gd')
	]
	, types: {
		jpeg: 'image/jpeg'
		, jpg: 'image/jpeg'
		, gif: 'image/gif'
		, png: 'image/png'
		, svg: 'image/svg+xml'
	}
});

console.error('Open "\x1b[33mhttp://localhost:3003/php-wasm/cgi-bin\x1b[0m" in your browser...');

const server = http.createServer(async (request, response) => {
	const result = await php.request(request);
	const reader = result.body.getReader();

	response.writeHead(result.status, [...result.headers.entries()].flat());

	let done = false;
	while (!done)
	{
		const chunk = await reader.read();
		done = chunk.done;
		chunk.value && response.write(chunk.value);
	}

	response.end();
});

server.listen(3003);
