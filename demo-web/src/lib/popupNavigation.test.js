vi.mock('./runtimePaths', () => ({
	baseUrlFor: (path = '') => new URL(`/php-wasm/${String(path).replace(/^\/+/, '')}`, 'http://localhost')
}));

import { popupTarget, resolvePopupHref, resolvePopupRequest } from './popupNavigation';

describe('popupNavigation', () => {
	it('resolves app-relative popup paths against the hosted base path', () => {
		expect(resolvePopupHref('install-demo.html?framework=drupal-7'))
			.toBe('http://localhost/php-wasm/install-demo.html?framework=drupal-7');
	});

	it('preserves absolute app paths for popup targets', () => {
		expect(resolvePopupHref('/php-wasm/cgi-bin/drupal'))
			.toBe(`${window.location.origin}/php-wasm/cgi-bin/drupal`);
	});

	it('uses a blank target for popup-style navigation', () => {
		expect(popupTarget).toBe('_blank');
	});

	it('splits popup requests into a path action and preserved query params', () => {
		expect(resolvePopupRequest('code-editor.html?path=/persist/cakephp-5/README.md'))
			.toEqual({
				action: 'http://localhost/php-wasm/code-editor.html'
				, params: [['path', '/persist/cakephp-5/README.md']]
			});
	});
});
