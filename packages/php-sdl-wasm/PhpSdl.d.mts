import type { PhpSdlArgs } from './public.d.ts';
import type { PhpWebBase } from './PhpWebBase.mjs';

export type { PhpSdlArgs, PhpSdlOptions } from './public.d.ts';

export declare class PhpSdl extends PhpWebBase {
	constructor(args: PhpSdlArgs);
}
