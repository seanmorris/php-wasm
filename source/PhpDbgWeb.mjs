import {PhpDbgWebBase} from './PhpDbgWebBase.mjs';

/** PHP debugger in a web context. */
export class PhpDbgWeb extends PhpDbgWebBase
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
			case '8.0': loader = import('./php8.0-dbg-web.mjs'); break;
			case '8.1': loader = import('./php8.1-dbg-web.mjs'); break;
			case '8.2': loader = import('./php8.2-dbg-web.mjs'); break;
			case '8.3': loader = import('./php8.3-dbg-web.mjs'); break;
			case '8.4': loader = import('./php8.4-dbg-web.mjs'); break;
			case '8.5': loader = import('./php8.5-dbg-web.mjs'); break;
			default: throw new Error(`Unsupported PHP runtime: ${version}`);
		}
		super(loader, {version, ...args});
	}
}
