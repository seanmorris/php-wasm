import {readFileSync} from 'node:fs';
import {expect, test} from 'vitest';
import {readEmbeddedCode, replaceEmbeddedUrl} from './embeddedUrl';

test('the full cube source round-trips through the fragment without entering the request URL', () => {
	const code = readFileSync('public/scripts/sdl-cube.php', 'utf8');
	window.history.replaceState({}, '', '/embedded-php.html?code=old&demo=old.php&version=8.4&no-service-worker#extra=kept');
	const query = new URLSearchParams(window.location.search);
	replaceEmbeddedUrl(query, code);
	expect(readEmbeddedCode(window.location)).toBe(code);
	expect(window.location.search).toBe('?version=8.4&no-service-worker=');
	expect(query.has('code')).toBe(false);
	expect(query.has('demo')).toBe(false);
	expect(new URLSearchParams(window.location.hash.slice(1)).get('extra')).toBe('kept');
});

test('fragment code preserves Unicode, percent escapes, plus signs and empty source', () => {
	const code = '<?php echo "🧊 café 100% %20 + # &";';
	const url = new URL('http://localhost/?code=legacy');
	url.hash = new URLSearchParams({code}).toString();
	expect(readEmbeddedCode(url)).toBe(code);
	url.hash = 'code=';
	expect(readEmbeddedCode(url)).toBe('');
	url.hash = '';
	expect(readEmbeddedCode(url)).toBe('legacy');
});

test('legacy query code decodes safely and absent code remains distinct from empty code', () => {
	const code = '<?php echo "100% %20 + # &";';
	expect(readEmbeddedCode(new URL(`http://localhost/?${new URLSearchParams({code: encodeURIComponent(code)})}`))).toBe(code);
	expect(readEmbeddedCode(new URL('http://localhost/?code=100%25'))).toBe('100%');
	expect(readEmbeddedCode(new URL('http://localhost/#heading'))).toBeNull();
});
