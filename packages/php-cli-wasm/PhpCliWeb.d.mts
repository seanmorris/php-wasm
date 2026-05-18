import type { PhpRuntimeArgs, PhpRuntimeValue } from './public';
import { PhpBase } from './PhpBase.mjs';

export class PhpCliWeb extends PhpBase {
	interactive: boolean;
	script?: string;
	code?: string;
	constructor(args?: PhpRuntimeArgs);
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	provideInput(line: string): Promise<void>;
	run(flags?: string[]): Promise<PhpRuntimeValue>;
	refresh(): Promise<void>;
	_enqueue(callback: (...params: Array<string | number | boolean | object | undefined>) => Promise<PhpRuntimeValue>, params?: Array<string | number | boolean | object | undefined>, readOnly?: boolean): Promise<PhpRuntimeValue>;
}
