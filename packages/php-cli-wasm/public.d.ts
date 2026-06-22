export type PhpRuntimeVersion = '8.0' | '8.1' | '8.2' | '8.3' | '8.4' | '8.5';
export type PhpRuntimeValue = object | string | number | boolean | Uint8Array | null | undefined | void;

export interface PhpPreloadFile {
	url: string | URL;
	path?: string;
	parent?: string;
	name?: string;
}

export interface PhpSharedLibrary {
	name?: string;
	url: string | URL;
	ini?: boolean;
	getLibs?: () => PhpSharedLibrary[];
	getFiles?: () => PhpPreloadFile[];
}

export interface PhpRuntimeArgs {
	autoTransaction?: boolean;
	version?: PhpRuntimeVersion;
	interactive?: boolean;
	script?: string;
	code?: string;
	shared?: Record<string, object | string | number | boolean | undefined>;
	locateFile?: (path: string, directory?: string) => string | URL | undefined;
	files?: PhpPreloadFile[];
	sharedLibs?: Array<string | URL | PhpSharedLibrary>;
	dynamicLibs?: Array<string | URL | PhpSharedLibrary>;
	debug?: boolean;
	ini?: string;
	persist?: object;
	[key: string]: object | string | number | boolean | undefined;
}

export interface PhpBaseModuleFactory {
	default: new (args: object) => object;
}

export declare class PhpBase extends EventTarget {
	constructor(phpBinLoader: Promise<PhpBaseModuleFactory>, args?: PhpRuntimeArgs, sapi?: string);
	autoTransaction: boolean;
	transactionStarted: boolean | Promise<void>;
	phpVersion?: PhpRuntimeVersion;
	phpArgs: PhpRuntimeArgs;
	binary: Promise<object>;
	inputString(byteString: string): void;
	input(items: Iterable<number>): void;
	flush(): void;
	tokenize(phpCode: string): string[];
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	run(phpCode: string): Promise<number>;
	exec(phpCode: string): Promise<PhpRuntimeValue>;
	refresh(): Promise<void>;
	analyzePath(path: string): Promise<object>;
	readdir(path: string): Promise<string[]>;
	readFile(path: string, options?: object): Promise<string | Uint8Array>;
	stat(path: string): Promise<object>;
	mkdir(path: string): Promise<void>;
	rmdir(path: string): Promise<void>;
	rename(path: string, newPath: string): Promise<void>;
	writeFile(path: string, data: string | Uint8Array | ArrayBufferLike | Iterable<number>, options?: object): Promise<void>;
	unlink(path: string): Promise<void>;
}
