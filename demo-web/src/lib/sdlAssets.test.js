import {afterEach, expect, test, vi} from 'vitest';
import {prepareSdlAssets, sdlAssetNames} from './sdlAssets';

afterEach(() => vi.unstubAllGlobals());

/** Creates an idle runtime fixture with observable filesystem writes. */
const runtime = () => {
	const FS = {mkdirTree: vi.fn(), writeFile: vi.fn()};
	return {FS, php: {binary: Promise.resolve({FS})}};
};

test('assets are fetched once per runtime and staged only after every download succeeds', async () => {
	const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
	vi.stubGlobal('fetch', fetch);
	const {FS, php} = runtime();
	const first = prepareSdlAssets(php, '/demo/sdl/');
	expect(prepareSdlAssets(php, '/demo/sdl/')).toBe(first);
	await first;
	expect(fetch).toHaveBeenCalledTimes(sdlAssetNames.length);
	expect(FS.mkdirTree).toHaveBeenCalledWith('/preload/sdl');
	expect(FS.writeFile.mock.calls.map(([name]) => name)).toEqual(sdlAssetNames.map(name => `/preload/sdl/${name}`));
});

test('an HTTP failure reports its asset, writes nothing and allows retry', async () => {
	vi.stubGlobal('fetch', vi.fn(async url => new Response('data', {status: String(url).endsWith('WOJTEK3.mp3') ? 404 : 200})));
	const {FS, php} = runtime();
	await expect(prepareSdlAssets(php, '/sdl/')).rejects.toThrow('SDL asset WOJTEK3.mp3: HTTP 404');
	expect(FS.writeFile).not.toHaveBeenCalled();
	vi.stubGlobal('fetch', vi.fn(async () => new Response('data')));
	await prepareSdlAssets(php, '/sdl/');
	expect(FS.writeFile).toHaveBeenCalledTimes(sdlAssetNames.length);
});

test('empty assets and network failures reject without staging partial files', async () => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
	const {FS, php} = runtime();
	await expect(prepareSdlAssets(php, '/sdl/')).rejects.toThrow('is empty');
	vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network failed'); }));
	await expect(prepareSdlAssets(php, '/sdl/')).rejects.toThrow('Network failed');
	expect(FS.writeFile).not.toHaveBeenCalled();
});
