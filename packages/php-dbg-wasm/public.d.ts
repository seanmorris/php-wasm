export type PhpRuntimeVersion = '8.0' | '8.1' | '8.2' | '8.3' | '8.4' | '8.5';
/** @deprecated Select a runtime package instead. */
export type PhpRuntimeVariant = never;
export type PhpRuntimeValue = object | string | number | boolean | Uint8Array | null | undefined | void;
export type PhpTemplateValue = PhpRuntimeValue | Array<PhpRuntimeValue>;

export interface PhpPreloadFile {
	url: string | URL;
	path?: string;
	parent?: string;
	name?: string;
}

/** A version-aware extension package accepted by sharedLibs and dynamicLibs. */
export interface PhpLibraryLoader {
	getLibs(php: {phpVersion?: PhpRuntimeVersion}): PhpSharedLibrary[];
	getFiles?(php: {phpVersion?: PhpRuntimeVersion}): PhpPreloadFile[];
}

export interface PhpSharedLibrary {
	name?: string;
	url: string | URL;
	ini?: boolean;
	getLibs?: Function;
	getFiles?: Function;
}

/** Output passed to `onDbgOutput`. `type` is 1 for stdout, 2 for stderr, 3 for a debugger error and 0 for any other debugger message. */
export interface PhpDbgOutput {
	type: 0 | 1 | 2 | 3;
	fd: number;
	bytes: Uint8Array;
	/** True while phpdbg is evaluating an `ev` expression. */
	evaluating: boolean;
}

/** Event passed to `onDbgEvent`. The only type today is `exception`. */
export interface PhpDbgEvent {
	type: string;
	name: string | null;
	message: string | null;
	file: string | null;
	line: number;
	status: number;
}

/** A stack frame from `dumpBacktrace()`. `frame` is the index `switchFrame()` takes; 0 is the innermost frame. */
export interface PhpDbgFrame {
	filename: string;
	lineNo: number;
	frame: number;
	selected: boolean;
	/** Debugger API 2 only. Empty for top-level code. */
	functionName?: string;
	/** Debugger API 2 only. Empty outside a class. */
	className?: string;
}

export type PhpDbgType = 'undefined' | 'null' | 'bool' | 'int' | 'float' | 'string' | 'array' | 'object' | 'resource' | 'callable' | 'unknown';

/** A value's PHP type. `count` is the number of elements in an array or of bytes in a string. */
export interface PhpDbgValue {
	type: PhpDbgType;
	className: string | null;
	count: number | null;
	reference: boolean;
	value: PhpRuntimeValue;
}

export interface PhpDbgSymbol extends PhpDbgValue {
	name: string;
}

export interface PhpVhost {
	pathPrefix: string;
	directory: string;
	entrypoint: string;
}

export interface PhpRuntimeArgs {
	autoTransaction?: boolean;
	version?: PhpRuntimeVersion;
	/** @deprecated Install php-sdl-wasm and use PhpSdl for SDL. */
	variant?: never;
	interactive?: boolean;
	script?: string;
	code?: string;
	shared?: Record<string, object | string | number | boolean | Function | undefined>;
	ENV?: Record<string, string>;
	/** Browser cookie policy for the fetch-backed curl extension. */
	libcurlFetchOptions?: {credentials?: 'omit' | 'same-origin' | 'include'};
	locateFile?: (path: string, directory?: string) => string | URL | undefined;
	files?: PhpPreloadFile[];
	sharedLibs?: Array<string | URL | PhpSharedLibrary | PhpLibraryLoader>;
	dynamicLibs?: Array<string | URL | PhpSharedLibrary | PhpLibraryLoader>;
	debug?: boolean;
	ini?: string;
	persist?: object | boolean;
	staticFS?: boolean;
	vHosts?: PhpVhost[];
	[key: string]: object | string | number | boolean | Function | undefined;
}

/** Constructor options for the debugger wrappers. */
export interface PhpDbgRuntimeArgs extends PhpRuntimeArgs {
	/** Extra phpdbg command-line arguments, such as `['-q']` to start without the welcome banner. */
	dbgArgs?: string[];
	/** Receives program and debugger output separately from the console streams. */
	onDbgOutput?: (output: PhpDbgOutput) => void;
	onDbgEvent?: (event: PhpDbgEvent) => void;
	/** Milliseconds between cooperative yields. Unset means the debugger never yields. */
	dbgYieldInterval?: number;
	/** Run shutdown functions, destructors and output handlers when a debugging session ends. */
	dbgManagedShutdown?: boolean;
}

export type PhpRuntimeFactory<Args = PhpRuntimeArgs> = ((args: Args) => PhpBinaryRuntime | Promise<PhpBinaryRuntime>)
	| (new (args: Args) => PhpBinaryRuntime);

export interface PhpBaseModuleFactory {
	default: PhpRuntimeFactory;
}


export interface PhpBinaryRuntime {
	inputDataQueue?: string[];
	awaitingInput?: ((value: string | undefined) => void) | null;
	triggerStdin?: (prompt?: string | null) => void;
	persist?: boolean;
	ccall?: Function;
	lengthBytesUTF8?: Function;
	_malloc?: Function;
	_free?: Function;
	stringToUTF8?: Function;
	setValue?: Function;
	UTF8ToString?: Function;
	getValue?: Function;
	HEAPU8?: Uint8Array;
	hasVrzno?: boolean;
	zvalToJS?: Function;
	consumeZval?: Function;
	onRefresh?: Set<Function>;
	FS?: {
		syncfs?: (populate: boolean, callback: (error?: Error) => void) => void;
	} & object;
}

/** Options for listing names or serializable directory entry types. */
export interface PhpReadDirectoryOptions {
	withFileTypes?: boolean;
}

/** Entry type resolved using the same link-following behavior as analyzePath. */
export interface PhpDirectoryEntry {
	name: string;
	isFolder: boolean;
}

/** Serializable filesystem node metadata returned by mkdir and analyzePath. */
export interface PhpFileNode {
	id: number;
	mode: number;
	mount: { mountpoint: string; mounts: string[] };
	isDevice: boolean;
	isFolder: boolean;
	read: boolean;
	write: boolean;
}

export type PhpPathAnalysis = { exists: false } | {
	exists: boolean;
	object: PhpFileNode & { exists: true };
	parentObject: undefined;
	path: string | null;
	name: string | null;
	parentExists: boolean;
	parentPath: string | null;
	error: number;
};

export interface PhpFileStat {
	dev: number;
	ino: number;
	mode: number;
	nlink: number;
	uid: number;
	gid: number;
	rdev: number;
	size: number;
	atime: Date;
	mtime: Date;
	ctime: Date;
	blksize: number;
	blocks: number;
}

export interface PhpReadFileOptions {
	encoding?: 'binary' | 'utf8';
	flags?: string | number;
}

export type { PhpBase } from './PhpBase.mjs';
