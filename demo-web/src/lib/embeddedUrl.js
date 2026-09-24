/**
 * Reads shared PHP source, preferring the fragment over legacy query links.
 * @param {Location|URL} location Current page URL.
 * @returns {string|null} Source, or null when the URL does not contain code.
 */
export const readEmbeddedCode = location => {
	const fragment = new URLSearchParams(location.hash.slice(1));
	if(fragment.has('code')) return fragment.get('code');
	const code = new URLSearchParams(location.search).get('code');
	if(code === null) return null;

	// Old links encoded the source once before URLSearchParams encoded it again.
	try
	{
		return decodeURIComponent(code);
	}
	catch
	{
		return code;
	}
};

/**
 * Stores source in the fragment so it is never part of the HTTP request URL.
 * @param {URLSearchParams} query Current runtime settings; legacy code is removed.
 * @param {string} code PHP source, encoded exactly once by URLSearchParams.
 * @returns {void}
 */
export const replaceEmbeddedUrl = (query, code) => {
	query.delete('code');
	query.delete('demo');
	const fragment = new URLSearchParams(window.location.hash.slice(1));
	fragment.set('code', code);
	const search = query.size ? `?${query}` : '';
	window.history.replaceState({}, document.title, `${window.location.pathname}${search}#${fragment}`);
};
