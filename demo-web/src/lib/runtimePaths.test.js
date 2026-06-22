import { resolveBasePath, trimBase } from './runtimePaths';

describe('runtimePaths', () => {
	it('trims trailing slashes from a configured base', () => {
		expect(trimBase('/php-wasm/')).toBe('/php-wasm');
		expect(trimBase('/')).toBe('');
	});

	it('builds root-relative paths when the base is /', () => {
		expect(resolveBasePath('/', '')).toBe('/');
		expect(resolveBasePath('/', 'cgi-worker.js')).toBe('/cgi-worker.js');
	});

	it('builds prefixed paths when the app is hosted under /php-wasm/', () => {
		expect(resolveBasePath('/php-wasm/', '')).toBe('/php-wasm/');
		expect(resolveBasePath('/php-wasm/', 'embedded-php.html')).toBe('/php-wasm/embedded-php.html');
		expect(resolveBasePath('/php-wasm/', '/cgi-bin/drupal')).toBe('/php-wasm/cgi-bin/drupal');
	});
});
