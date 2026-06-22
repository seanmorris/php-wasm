import type { PhpRuntimeArgs, PhpRuntimeValue } from 'php-wasm/PhpBase.mjs';
import { PhpBase } from 'php-wasm/PhpBase.mjs';

export class PhpDbgWeb extends PhpBase {
	running: boolean;
	paused: boolean;
	currentFilePtr: number | null;
	currentLinePtr: number | null;
	bpCountPtr: number | null;
	constructor(args?: PhpRuntimeArgs);
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	run(): Promise<number>;
	provideInput(line: string): Promise<void>;
	getPrompt(): Promise<string>;
	isExecuting(): Promise<number>;
	currentFile(): Promise<string>;
	currentLine(): Promise<number>;
	bpCount(): Promise<number>;
	dumpVars(): Promise<object>;
	dumpGlobals(): Promise<object>;
	dumpConstants(): Promise<object>;
	dumpFunctions(): Promise<object>;
	dumpClasses(): Promise<object>;
	dumpFiles(): Promise<object>;
	dumpBacktrace(): Promise<object>;
	switchFrame(frame: number): Promise<number>;
	refresh(): Promise<void>;
	_enqueue(callback: (...params: Array<string | number | boolean | object | undefined>) => Promise<PhpRuntimeValue>, params?: Array<string | number | boolean | object | undefined>, readOnly?: boolean): Promise<PhpRuntimeValue>;
}
