import type { PhpCgiRuntimeArgs } from './public.d.ts';
import type { PhpCgiWebBase } from './PhpCgiWebBase.mjs';

export class PhpCgiWeb extends PhpCgiWebBase {
	constructor(args?: PhpCgiRuntimeArgs);
}
