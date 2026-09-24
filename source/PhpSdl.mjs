import { PhpWebBase } from './PhpWebBase.mjs';

/** Browser PHP with SDL, loaded from a matching package-local native factory. */
export class PhpSdl extends PhpWebBase
{
	/**
	 * Creates an SDL runtime; versioned package entries supply the native factory.
	 * @param {PhpSdlArgs} args Browser configuration and matching runtime.
	 */
	constructor(args)
	{
		const {runtime, version} = args ?? {};
		const factory = runtime && typeof runtime === 'object' && 'default' in runtime ? runtime.default : runtime;

		if(typeof factory !== 'function')
		{
			throw new TypeError('PhpSdl requires a matching runtime factory; import a versioned php-sdl-wasm entry.');
		}
		if(!/^8\.[0-5]$/.test(version ?? ''))
		{
			throw new TypeError(`Unsupported SDL PHP version: ${version}`);
		}

		super(Promise.resolve(runtime), {...args, version});
	}
}
