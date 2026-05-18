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

export interface PhpVhost {
	pathPrefix: string;
	directory: string;
	entrypoint: string;
}

export interface RuntimeRequest {
	url: string | URL;
	method?: string;
	headers?: Headers | Map<string, string> | Record<string, string>;
	connection?: { encrypted?: boolean };
	socket?: { encrypted?: boolean };
	body?: ReadableStream<Uint8Array>;
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
	docroot: string;
	maxRequestAge: number;
	staticCacheTime: number;
	dynamicCacheTime: number;
	vHosts: PhpVhost[];
}

export declare class PhpCgiBase extends EventTarget {
	constructor(phpBinLoader: Promise<{ default: new (args: object) => object }>, args?: PhpCgiRuntimeArgs);
	phpVersion?: PhpRuntimeVersion;
	binary: Promise<object>;
	refresh(): Promise<void>;
	request(request: RuntimeRequest): Promise<Response | string | undefined>;
	analyzePath(path: string): Promise<object>;
	readdir(path: string): Promise<string[]>;
	readFile(path: string, options?: object): Promise<string | Uint8Array>;
	stat(path: string): Promise<object>;
	mkdir(path: string): Promise<void>;
	rmdir(path: string): Promise<void>;
	rename(path: string, newPath: string): Promise<void>;
	writeFile(path: string, data: string | Uint8Array | ArrayBufferLike | Iterable<number>, options?: object): Promise<void>;
	unlink(path: string): Promise<void>;
	putEnv(name: string, value: string): Promise<void>;
	getSettings(): Promise<PhpCgiSettings>;
	setSettings(settings: Partial<PhpCgiSettings>): void;
	getEnvs(): Promise<Record<string, string>>;
	setEnvs(env: Record<string, string>): void;
	storeInit(): Promise<void>;
	loadInit(binary: object): void;
}
