import type { PhpCloudflareArgs } from './public.d.ts';
import type { PhpBase } from './PhpBase.mjs';

export type { PhpCloudflareArgs, PhpCloudflareOptions, PhpCloudflareRuntimeOptions } from './public.d.ts';

export declare class PhpCloudflare extends PhpBase {
	constructor(args: PhpCloudflareArgs);
}
