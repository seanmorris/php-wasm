import type { PhpRuntimeArgs, PhpRuntimeValue } from './public';
import { PhpBase } from './PhpBase.mjs';

export class PhpWebview extends PhpBase {
	constructor(args?: PhpRuntimeArgs);
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	refresh(): Promise<void>;
	_enqueue(callback: (...params: Array<string | number | boolean | object | undefined>) => Promise<PhpRuntimeValue>, params?: Array<string | number | boolean | object | undefined>, readOnly?: boolean): Promise<PhpRuntimeValue>;
}
