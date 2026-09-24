import {expect} from '@playwright/test';

/**
 * Check that debugger output and inspector controls cannot expand their host.
 * @param {import('@playwright/test').Locator} host Panel containing the debugger.
 * @returns {Promise<void>} Resolves after checking the rendered layout.
 */
export const expectDebuggerContained = async host => {
	const bounds = await host.evaluate(panel => {
		const debuggerPanel = panel.querySelector('.phpdbg');
		const prompt = panel.querySelector('.console-input');
		const rect = debuggerPanel.getBoundingClientRect();
		return {
			width: rect.width
			, height: rect.height
			, availableWidth: panel.clientWidth
			, availableHeight: panel.clientHeight
			, debuggerOverflow: debuggerPanel.scrollWidth - debuggerPanel.clientWidth
			, promptOverflow: prompt.scrollWidth - prompt.clientWidth
			, pageWidth: document.documentElement.scrollWidth
			, viewportWidth: window.innerWidth
		};
	});
	// Allow fractional flex sizes to round up by one CSS pixel.
	expect(bounds.width).toBeLessThanOrEqual(bounds.availableWidth + 1);
	expect(bounds.height).toBeLessThanOrEqual(bounds.availableHeight + 1);
	expect(bounds.debuggerOverflow).toBeLessThanOrEqual(1);
	expect(bounds.promptOverflow).toBeLessThanOrEqual(1);
	expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewportWidth);
};
