import type { PhpCgiRuntimeArgs } from './public.d.ts';
import { PhpCgiWebBase } from './PhpCgiWebBase.mjs';

export class PhpCgiWebview extends PhpCgiWebBase {
	constructor(args?: PhpCgiRuntimeArgs);
}
