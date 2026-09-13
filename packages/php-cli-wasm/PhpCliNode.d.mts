import type { PhpRuntimeArgs, PhpRuntimeValue } from './public.d.ts';
import type { PhpBase } from './PhpBase.mjs';

export class PhpCliNode extends PhpBase<[flags?: string[]], number> {
	interactive: boolean;
	script?: string;
	code?: string;
	constructor(args?: PhpRuntimeArgs);
	provideInput(line: string): Promise<void>;
	run(flags?: string[]): Promise<number>;
	_run(flags?: string[]): Promise<number>;
}
