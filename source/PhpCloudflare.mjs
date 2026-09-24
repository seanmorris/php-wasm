import { PhpBase } from './PhpBase.mjs';

/**
 * PHP wrapper for Cloudflare Workers with statically imported WebAssembly.
 * Construct instances inside a request handler; bindings and shared values
 * belong to that instance, not to the worker's global scope.
 */
export class PhpCloudflare extends PhpBase
{
	/**
	 * Creates a runtime from a matching factory and precompiled Wasm module.
	 * @param {PhpCloudflareArgs} args Runtime configuration.
	 */
	constructor(args)
	{
		const settings = globalThis.phpSettings ?? {};

		for(const options of [settings, args])
		{
			if(options.persist !== undefined && options.persist !== false)
			{
				throw new TypeError('PhpCloudflare does not support persistent filesystems.');
			}

			for(const option of ['sharedLibs', 'dynamicLibs', 'dynamicLibraries'])
			{
				if(options[option] !== undefined)
				{
					throw new TypeError(`PhpCloudflare does not support ${option}; compile extensions statically.`);
				}
			}

			for(const option of ['instantiateWasm', 'wasmBinary'])
			{
				if(options[option] !== undefined)
				{
					throw new TypeError(`PhpCloudflare controls ${option}; supply a precompiled wasmModule.`);
				}
			}
		}

		const {runtime, wasmModule, version} = args;
		const factory = runtime && typeof runtime === 'object' && 'default' in runtime ? runtime.default : runtime;

		if(typeof factory !== 'function')
		{
			throw new TypeError('PhpCloudflare requires an Emscripten runtime factory.');
		}

		if(!(wasmModule instanceof WebAssembly.Module))
		{
			throw new TypeError('PhpCloudflare requires a precompiled WebAssembly.Module.');
		}

		// Never inherit request bindings or mutable shared containers globally.
		const runtimeArgs = {
			...settings
			, ...args
			, version
			, persist: false
			, cfd1: {...args.cfd1}
			, shared: {...args.shared}
			, instantiateWasm(imports, receiveInstance) {
				const instance = new WebAssembly.Instance(wasmModule, imports);
				return receiveInstance(instance, wasmModule);
			}
		};

		delete runtimeArgs.variant;

		// The adapter has already validated and snapshotted global settings.
		// Prevent PhpBase from merging them again behind the fixed hook.
		super(Promise.resolve(runtime), runtimeArgs, 'embed', {});
	}
}
