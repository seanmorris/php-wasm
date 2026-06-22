import type { PhpRuntimeArgs, PhpRuntimeValue } from './public';
import { PhpBase } from './PhpBase.mjs';

export class PhpCliNode extends PhpBase {
	interactive: boolean;
	script?: string;
	code?: string;
	constructor(args?: PhpRuntimeArgs);
	provideInput(line: string): Promise<void>;
	run(flags?: string[]): Promise<PhpRuntimeValue>;
	_run(flags?: string[]): Promise<number>;
}
