/** Files used by the SDL cube, relative to the demo's public asset directory. */
export const sdlAssetNames = ['sean-icon-32.png', 'DejaVuSansMono.ttf', 'loop.ogg', 'click.wav'];

const textureUrl = new URL('../assets/icons/sean-icon-32.png', import.meta.url);

const stagedAssets = new WeakMap();

/**
 * Fetches every cube asset before staging it in the idle PHP filesystem.
 * Failed requests are retryable and cannot strand Emscripten's preload counter.
 * @param {object} php PHP runtime wrapper.
 * @param {string} baseUrl Public SDL asset directory, including a trailing slash.
 * @returns {Promise<void>} Resolves after all assets are available under /preload/sdl.
 */
export const prepareSdlAssets = (php, baseUrl) => {
	if(stagedAssets.has(php))
	{
		return stagedAssets.get(php);
	}

	const pending = (async () => {
		const assets = await Promise.all(sdlAssetNames.map(async name => {
			const url = name === 'sean-icon-32.png' ? textureUrl : `${baseUrl}${name}`;
			const response = await fetch(url, {signal: AbortSignal.timeout(30000)});

			if(!response.ok)
			{
				throw new Error(`SDL asset ${name}: HTTP ${response.status}`);
			}

			const bytes = new Uint8Array(await response.arrayBuffer());

			if(!bytes.length)
			{
				throw new Error(`SDL asset ${name} is empty`);
			}

			return {name, bytes};
		}));
		const {FS} = await php.binary;
		FS.mkdirTree('/preload/sdl');

		for(const {name, bytes} of assets)
		{
			FS.writeFile(`/preload/sdl/${name}`, bytes);
		}
	})();

	stagedAssets.set(php, pending);
	pending.catch(() => stagedAssets.delete(php));
	return pending;
};
