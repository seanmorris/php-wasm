/**
 * Selects the dedicated package while retaining the CI matrix's native label.
 * @param {string} version PHP minor version.
 * @param {string} variant Native CI build label.
 * @param {object} args Runtime options.
 * @returns {Promise<object>} Selected PHP runtime.
 */
export async function createEmbeddedRuntime(version, variant, args = {})
{
	if(variant === '_sdl')
	{
		const {PhpSdl} = await import(`/packages/php-sdl-wasm/php${version}-sdl.mjs`);
		return new PhpSdl(args);
	}
	const {PhpWeb} = await import('/packages/php-wasm/PhpWeb.mjs');
	return new PhpWeb({version, ...args});
}
