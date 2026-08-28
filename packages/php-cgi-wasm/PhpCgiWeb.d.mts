import type { PhpCgiRuntimeArgs } from './public.d.ts';
import { PhpCgiWebBase } from './PhpCgiWebBase.mjs';

export class PhpCgiWeb extends PhpCgiWebBase {
	constructor(args?: PhpCgiRuntimeArgs);
}
