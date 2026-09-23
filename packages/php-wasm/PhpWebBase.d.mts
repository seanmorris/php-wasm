import type { PhpRuntimeArgs, PhpRuntimeFactory, PhpBaseModuleFactory, PhpRuntimeValue } from './public.d.ts';
import type { PhpBase } from './PhpBase.mjs';

export class PhpWebBase extends PhpBase<[phpCode: string], void> {
	constructor(loader: Promise<PhpRuntimeFactory | PhpBaseModuleFactory>, args?: PhpRuntimeArgs);
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	refresh(): Promise<void>;
	_enqueue(callback: (...params: Array<string | number | boolean | object | undefined>) => Promise<PhpRuntimeValue>, params?: Array<string | number | boolean | object | undefined>, readOnly?: boolean): Promise<PhpRuntimeValue>;
}
