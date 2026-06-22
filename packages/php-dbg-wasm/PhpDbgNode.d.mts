import type { PhpRuntimeArgs } from 'php-wasm/PhpBase.mjs';
import { PhpBase } from 'php-wasm/PhpBase.mjs';

export class PhpDbgNode extends PhpBase {
	running: boolean;
	paused: boolean;
	currentFilePtr: number | null;
	currentLinePtr: number | null;
	bpCountPtr: number | null;
	constructor(args?: PhpRuntimeArgs);
	run(): Promise<number>;
	provideInput(line: string): Promise<void>;
	getPrompt(): Promise<string>;
	isExecuting(): Promise<number>;
	isRunning(): Promise<number>;
	currentFile(): Promise<string>;
	currentLine(): Promise<number>;
	bpCount(): Promise<number>;
	dumpVars(): Promise<object | undefined>;
	dumpGlobals(): Promise<object | undefined>;
	dumpConstants(): Promise<object | undefined>;
	dumpFunctions(): Promise<object>;
	dumpClasses(): Promise<object>;
	dumpFiles(): Promise<string[]>;
	dumpBacktrace(): Promise<Array<{filename: string, lineNo: number, frame: number}>>;
	switchFrame(frame: number): Promise<number>;
}
