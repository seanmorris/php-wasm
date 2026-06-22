/**
 * Helpers for opening popup-backed demo flows without losing query parameters.
 */
import { baseUrlFor } from './runtimePaths';

export const popupTarget = '_blank';

/**
 * Normalizes demo links into fully qualified popup URLs.
 */
export const resolvePopupHref = (pathOrUrl = '') => {
	if(/^[a-z]+:\/\//i.test(pathOrUrl))
	{
		return pathOrUrl;
	}

	if(pathOrUrl.startsWith('/'))
	{
		return new URL(pathOrUrl, window.location.origin).toString();
	}

	return baseUrlFor(pathOrUrl).toString();
};

/**
 * Converts a popup URL into a form post target plus serialized search params.
 */
export const resolvePopupRequest = (pathOrUrl = '') => {
	const url = new URL(resolvePopupHref(pathOrUrl));

	return {
		action: `${url.origin}${url.pathname}`
		, params: [...url.searchParams.entries()]
	};
};
