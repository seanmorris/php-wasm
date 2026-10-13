import {PhpDbgWebBase} from './PhpDbgWebBase.mjs';

/** PHP debugger in a worker context. */
export class PhpDbgWorker extends PhpDbgWebBase
{
	/**
	 * Creates a browser-hosted debugger runtime.
	 * @param {PhpRuntimeArgs} args Debugger runtime configuration.
	 */
	constructor(args = {})
	{
		const version = args.version ?? '8.4';
		let loader;
		switch(version)
		{
			case '8.0': loader = import('./php8.0-dbg-worker.mjs'); break;
			case '8.1': loader = import('./php8.1-dbg-worker.mjs'); break;
			case '8.2': loader = import('./php8.2-dbg-worker.mjs'); break;
			case '8.3': loader = import('./php8.3-dbg-worker.mjs'); break;
			case '8.4': loader = import('./php8.4-dbg-worker.mjs'); break;
			case '8.5': loader = import('./php8.5-dbg-worker.mjs'); break;
			default: throw new Error(`Unsupported PHP runtime: ${version}`);
		}
		super(loader, {version, ...args});
	}
}
