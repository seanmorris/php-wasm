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
	ENV?: Record<string, string>;
	locateFile?: (path: string, directory?: string) => string | URL | undefined;
	files?: PhpPreloadFile[];
	sharedLibs?: Array<string | URL | PhpSharedLibrary>;
	dynamicLibs?: Array<string | URL | PhpSharedLibrary>;
	debug?: boolean;
	ini?: string;
	persist?: object | boolean;
	staticFS?: boolean;
	vHosts?: PhpVhost[];
	[key: string]: object | string | number | boolean | Function | undefined;
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

/** Configuration supported by a statically linked Cloudflare runtime. */
export interface PhpCloudflareRuntimeOptions extends PhpRuntimeArgs {
	cfd1?: Record<string, object>;
	persist?: false;
	sharedLibs?: never;
	dynamicLibs?: never;
	dynamicLibraries?: never;
	instantiateWasm?: never;
	wasmBinary?: never;
	variant?: never;
}

/** Options for a version-specific entrypoint with a fixed factory and Wasm module. */
export interface PhpCloudflareOptions extends PhpCloudflareRuntimeOptions {
	runtime?: never;
	wasmModule?: never;
	version?: never;
}

/** Options for the generic adapter; the factory and Wasm module must match. */
export interface PhpCloudflareArgs extends PhpCloudflareRuntimeOptions {
	runtime: PhpRuntimeFactory | PhpBaseModuleFactory;
	wasmModule: WebAssembly.Module;
	version: PhpRuntimeVersion;
}

export type { PhpBase } from './PhpBase.mjs';
