import type { PhpCgiRuntimeArgs, PhpRuntimeValue } from './public';
import { PhpCgiBase } from './PhpCgiBase.mjs';

export class PhpCgiWebBase extends PhpCgiBase {
	constructor(phpBinLoader: Promise<{ default: new (args: object) => object }>, args?: PhpCgiRuntimeArgs);
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	refresh(): Promise<void>;
	_enqueue(callback: (...params: Array<string | number | boolean | object | undefined>) => Promise<PhpRuntimeValue>, params?: Array<string | number | boolean | object | undefined>, readOnly?: boolean): Promise<PhpRuntimeValue>;
}
