export type PhpRuntimeVersion = '8.0' | '8.1' | '8.2' | '8.3' | '8.4' | '8.5';
export type PhpRuntimeVariant = '' | '_sdl';
export type PhpRuntimeValue = object | string | number | boolean | Uint8Array | null | undefined | void;
export type PhpTemplateValue = PhpRuntimeValue | Array<PhpRuntimeValue>;

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
	getLibs?: Function;
	getFiles?: Function;
}

export interface PhpVhost {
	pathPrefix: string;
	directory: string;
	entrypoint: string;
}

export interface PhpRuntimeArgs {
	autoTransaction?: boolean;
	version?: PhpRuntimeVersion;
	variant?: PhpRuntimeVariant;
	interactive?: boolean;
	script?: string;
	code?: string;
	shared?: Record<string, object | string | number | boolean | Function | undefined>;
	locateFile?: (path: string, directory?: string) => string | URL | undefined;
	files?: PhpPreloadFile[];
	sharedLibs?: Array<string | URL | PhpSharedLibrary>;
	dynamicLibs?: Array<string | URL | PhpSharedLibrary>;
	debug?: boolean;
	ini?: string;
	persist?: object;
	staticFS?: boolean;
	vHosts?: PhpVhost[];
	[key: string]: object | string | number | boolean | Function | undefined;
}

export interface PhpBaseModuleFactory {
	default: new (args: object) => object;
}

export interface PhpBinaryRuntime {
	inputDataQueue?: string[];
	awaitingInput?: ((value: string | undefined) => void) | null;
	triggerStdin?: () => void;
	persist?: boolean;
	ccall?: Function;
	lengthBytesUTF8?: Function;
	_malloc?: Function;
	_free?: Function;
	stringToUTF8?: Function;
	setValue?: Function;
	UTF8ToString?: Function;
	getValue?: Function;
	HEAP8?: Int8Array;
	hasVrzno?: boolean;
	zvalToJS?: Function;
	onRefresh?: Set<Function>;
	FS?: {
		syncfs?: (populate: boolean, callback: (error?: Error) => void) => void;
	} & object;
}

export declare class PhpBase extends EventTarget {
	constructor(phpBinLoader: Promise<PhpBaseModuleFactory>, args?: PhpRuntimeArgs, sapi?: string);
	autoTransaction: boolean;
	transactionStarted: boolean | Promise<void>;
	phpVersion?: PhpRuntimeVersion;
	phpVariant?: PhpRuntimeVariant;
	phpArgs: PhpRuntimeArgs;
	queue: Array<[Function, Array<string | number | boolean | object | undefined>, (value?: PhpRuntimeValue) => void, (reason?: object | string | number | boolean | Error) => void]>;
	binary: Promise<PhpBinaryRuntime>;
	inputString(byteString: string): void;
	input(items: Iterable<number>): void;
	flush(): void;
	tokenize(phpCode: string): string[];
	startTransaction(): Promise<void>;
	commitTransaction(readOnly?: boolean): Promise<void>;
	run(phpCode: string): Promise<number>;
	exec(phpCode: string): Promise<PhpRuntimeValue>;
	x(fragments: TemplateStringsArray, ...values: PhpTemplateValue[]): Promise<PhpRuntimeValue>;
	r(fragments: TemplateStringsArray, ...values: PhpTemplateValue[]): Promise<string>;
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
