import type { PhpRuntimeArgs } from './public.d.ts';
import type { PhpBase } from './PhpBase.mjs';

export class PhpNode extends PhpBase {
	constructor(args?: PhpRuntimeArgs);
}
