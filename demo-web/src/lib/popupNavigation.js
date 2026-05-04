import { baseUrlFor } from './runtimePaths';

export const popupTarget = '_blank';

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

export const resolvePopupRequest = (pathOrUrl = '') => {
	const url = new URL(resolvePopupHref(pathOrUrl));

	return {
		action: `${url.origin}${url.pathname}`
		, params: [...url.searchParams.entries()]
	};
};
