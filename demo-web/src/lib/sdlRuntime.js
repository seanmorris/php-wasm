/**
 * Loads only the selected PHP/SDL build; literal imports expose assets to Vite.
 * @param {string} version PHP minor version.
 * @returns {Promise<Function>} Version-bound browser runtime constructor.
 */
export async function loadSdlRuntime(version)
{
	switch(version)
	{
		case '8.5':
			return (await import('php-sdl-wasm/php8.5-sdl.mjs')).PhpSdl;

		case '8.4':
			return (await import('php-sdl-wasm/php8.4-sdl.mjs')).PhpSdl;

		case '8.3':
			return (await import('php-sdl-wasm/php8.3-sdl.mjs')).PhpSdl;

		case '8.2':
			return (await import('php-sdl-wasm/php8.2-sdl.mjs')).PhpSdl;

		case '8.1':
			return (await import('php-sdl-wasm/php8.1-sdl.mjs')).PhpSdl;

		case '8.0':
			return (await import('php-sdl-wasm/php8.0-sdl.mjs')).PhpSdl;

		default:
			throw new Error(`Unsupported SDL PHP version: ${version}`);
	}
}
