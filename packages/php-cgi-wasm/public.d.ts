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

export interface RuntimeRequest {
	url: string | URL;
	method?: string;
	headers?: Headers | Map<string, string> | Record<string, string>;
	connection?: { encrypted?: boolean };
	socket?: { encrypted?: boolean };
	body?: ReadableStream<Uint8Array> | null;
	arrayBuffer?: () => Promise<ArrayBuffer>;
	on?: (event: string, callback: (...params: object[]) => void) => void;
}

export type PhpRuntimeHook = (request: RuntimeRequest, response?: Response) => void;
export type PhpNotFoundHook = (request: RuntimeRequest) => Response | string | undefined;

export interface PhpCgiRuntimeArgs {
	version?: PhpRuntimeVersion;
	docroot?: string;
	prefix?: string;
	exclude?: string[];
	rewrite?: (path: string) => string | { scriptName: string; path: string };
	entrypoint?: string;
	cookies?: string;
	types?: Record<string, string>;
	onRequest?: PhpRuntimeHook;
	notFound?: PhpNotFoundHook;
	sharedLibs?: Array<string | URL | PhpSharedLibrary>;
	dynamicLibs?: Array<string | URL | PhpSharedLibrary>;
	actions?: Record<string, (...params: Array<string | number | boolean | object | undefined>) => PhpRuntimeValue | Promise<PhpRuntimeValue>>;
	files?: PhpPreloadFile[];
	autoTransaction?: boolean;
	maxRequestAge?: number;
	staticCacheTime?: number;
	dynamicCacheTime?: number;
	vHosts?: PhpVhost[];
	env?: Record<string, string>;
	ini?: string;
	staticFS?: boolean;
	persist?: object | object[];
	locateFile?: (path: string, directory?: string) => string | URL | undefined;
}

export interface PhpCgiSettings {
	docroot: string | null;
	maxRequestAge: number;
	staticCacheTime: number;
	dynamicCacheTime: number;
	vHosts: PhpVhost[];
}

export interface PhpCgiModuleFactory {
	default: PhpRuntimeFactory;
}
export type { PhpCgiBase } from './PhpCgiBase.mjs';
