import { useEffect } from 'react';

const viewportHeightProperty = '--visual-viewport-height';
const viewportOffsetTopProperty = '--visual-viewport-offset-top';

/**
 * Reflects the browser's visual viewport in CSS without allowing a stale
 * viewport offset to move the application beyond the layout viewport.
 */
export const updateVisualViewportProperties = (
	viewport
	, root = document.documentElement
) => {
	const layoutHeight = root.clientHeight || viewport.height;
	const height = Math.min(viewport.height, layoutHeight);
	const maximumOffsetTop = Math.max(0, layoutHeight - height);
	const offsetTop = Math.min(
		Math.max(0, viewport.offsetTop)
		, maximumOffsetTop
	);

	root.style.setProperty(viewportHeightProperty, `${height}px`);
	root.style.setProperty(viewportOffsetTopProperty, `${offsetTop}px`);
};

/**
 * Keeps terminal preview shells inside Safari's keyboard-sized visual
 * viewport. CSS viewport units intentionally do not resize for the keyboard.
 */
export const useVisualViewportProperties = () => {
	useEffect(() => {
		const viewport = window.visualViewport;

		if(!viewport)
		{
			return undefined;
		}

		const root = document.documentElement;
		const update = () => updateVisualViewportProperties(viewport, root);

		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		window.addEventListener('resize', update);
		update();

		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
			root.style.removeProperty(viewportHeightProperty);
			root.style.removeProperty(viewportOffsetTopProperty);
		};
	}, []);
};
