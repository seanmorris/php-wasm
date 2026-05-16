/**
 * Worker-safe path helpers derived from the active worker location.
 */
/**
 * Removes a trailing slash from a configured base URL.
 */
export const trimBase = (baseUrl = '/') => baseUrl.endsWith('/')
	? baseUrl.slice(0, -1)
	: baseUrl;

/**
 * Resolves an app-relative path against the configured base URL.
 */
export const resolveBasePath = (baseUrl = '/', path = '') => {
	const trimmedBase = trimBase(baseUrl);
	const cleanPath = path.replace(/^\/+/, '');

	if(!cleanPath)
	{
		return trimmedBase ? `${trimmedBase}/` : '/';
	}

	return trimmedBase
		? `${trimmedBase}/${cleanPath}`
		: `/${cleanPath}`;
};

const baseUrl = import.meta.env.BASE_URL ?? new URL('./', self.location.href).pathname;
const trimmedBase = trimBase(baseUrl);

export const routerBase = trimmedBase || '/';
export const libType = import.meta.env.VITE_LIB_TYPE || import.meta.env.VITE_BUILD_TYPE || 'dynamic';
export const buildType = libType;

/**
 * Builds a worker-relative pathname for CGI routes and assets.
 */
export const basePath = (path = '') => resolveBasePath(baseUrl, path);

/**
 * Builds an absolute URL inside the worker's origin scope.
 */
export const baseUrlFor = (path = '') => new URL(basePath(path), self.location.origin);

if(!['dynamic', 'shared', 'static'].includes(libType))
{
	console.warn(`libType invalid! VITE_LIB_TYPE should be one of 'dynamic', 'shared', 'static', or EMPTY.`);
}
