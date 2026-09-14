import { updateVisualViewportProperties } from './visualViewport';

describe('updateVisualViewportProperties', () => {
	it('anchors a keyboard-panned visual viewport inside the layout viewport', () => {
		const root = document.createElement('div');

		Object.defineProperty(root, 'clientHeight', {
			configurable: true
			, value: 1292
		});

		updateVisualViewportProperties({
			height: 551
			, offsetTop: 741
		}, root);

		expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('551px');
		expect(root.style.getPropertyValue('--visual-viewport-offset-top')).toBe('741px');
	});

	it('discards Safari\'s stale offset when the visual viewport expands', () => {
		const root = document.createElement('div');

		Object.defineProperty(root, 'clientHeight', {
			configurable: true
			, value: 1292
		});

		updateVisualViewportProperties({
			height: 1292
			, offsetTop: 741
		}, root);

		expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('1292px');
		expect(root.style.getPropertyValue('--visual-viewport-offset-top')).toBe('0px');
	});
});
