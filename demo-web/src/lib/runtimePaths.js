/**
 * Browser-side path helpers derived from the Vite base URL.
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

const baseUrl = import.meta.env.BASE_URL ?? '/';
const trimmedBase = trimBase(baseUrl);

export const routerBase = trimmedBase || '/';
export const buildType = import.meta.env.VITE_BUILD_TYPE || 'dynamic';
export const defaultPhpVersion = import.meta.env.VITE_PHP_VERSION || '8.4';

/**
 * Builds an app-relative pathname for links and worker assets.
 */
export const basePath = (path = '') => resolveBasePath(baseUrl, path);

/**
 * Builds an absolute URL for the current origin and demo base path.
 */
export const baseUrlFor = (path = '') => new URL(basePath(path), window.location.origin);

if(!['dynamic', 'shared', 'static'].includes(buildType))
{
	console.warn(`buildType invalid! VITE_BUILD_TYPE should be one of 'dynamic', 'shared', 'static', or EMPTY.`);
}
