import fs from 'node:fs';
import {test, expect} from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const variant = process.env.PHP_VARIANT ?? '';
const libType = process.env.LIB_TYPE ?? 'dynamic';
const built = fs.existsSync(`packages/curl/php${version}-curl.so`);

test.skip(libType !== 'dynamic' || variant === '_sdl' || !built, 'php-wasm-curl is built as a dynamic extension only');

test('curl requests go through fetch and obey the browser origin rules', async ({page}) => {
	await page.goto('harness/index.html');
	const result = await page.evaluate(async version => {
		const {createEmbeddedRuntime} = await import('/php-wasm/harness/embedded-runtime.mjs');
		const curl = await import('/packages/curl/index.mjs');
		const php = await createEmbeddedRuntime(version, '', {sharedLibs: [curl]});
		let stdout = '', stderr = '';
		php.addEventListener('output', event => stdout += event.detail.join(''));
		php.addEventListener('error', event => stderr += event.detail.join(''));
		const sameOrigin = new URL('/php-wasm/curl-echo', location.href).href;
		const crossOrigin = sameOrigin.replace('127.0.0.1', 'localhost');
		const status = await php.run(`<?php
			$ch = curl_init(${JSON.stringify(sameOrigin)});
			curl_setopt_array($ch, [
				CURLOPT_RETURNTRANSFER => true,
				CURLOPT_HEADER => true,
				CURLOPT_POSTFIELDS => 'hello=browser',
				CURLOPT_HTTPHEADER => ['X-Custom: one'],
			]);
			$response = curl_exec($ch);
			$size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
			$echo = json_decode(substr($response, $size), true);
			$cross = curl_init(${JSON.stringify(crossOrigin)});
			curl_setopt($cross, CURLOPT_RETURNTRANSFER, true);
			echo json_encode([
				'code' => curl_getinfo($ch, CURLINFO_HTTP_CODE),
				'echoHeader' => str_contains(substr($response, 0, $size), "x-echo: yes"),
				'method' => $echo['method'],
				'body' => $echo['body'],
				'custom' => $echo['headers']['x-custom'],
				'cross' => [curl_exec($cross), curl_errno($cross)],
			]);
		`);
		return {status, stdout, stderr};
	}, version);

	expect(result.stderr).toBe('');
	expect(result.status).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual({
		code: 200
		, echoHeader: true
		, method: 'POST'
		, body: 'hello=browser'
		, custom: 'one'
		, cross: [false, 7]
	});
});
