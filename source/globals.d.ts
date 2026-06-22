declare const ENV: Record<string, string>;

declare interface PhpModuleGlobal {
	ENV?: Record<string, string>;
	preRun?: Array<() => void> | (() => void);
}

declare const Module: PhpModuleGlobal;

declare interface PhpModuleFactory {
	default: new (args: object) => object;
}

declare type PhpRuntimeVersion = '8.0' | '8.1' | '8.2' | '8.3' | '8.4' | '8.5';
declare type PhpRuntimeVariant = '' | '_sdl';
declare type PhpRuntimeTarget = `${PhpRuntimeVersion}${PhpRuntimeVariant}`;

declare type PhpQueueParam = string | number | boolean | object | undefined;
declare type PhpMessageParam = string | number | boolean | object | null | undefined;
declare type PhpRuntimeValue = object | string | number | boolean | Uint8Array | null | undefined | void;
declare type PhpQueueParams = PhpQueueParam[];
declare type PhpMessageParams = PhpMessageParam[];
declare type PhpQueueResolve = (value?: PhpRuntimeValue) => void;
declare type PhpQueueReject = (reason?: object | string | number | boolean | Error) => void;
declare type PhpQueuedCallback = (...params: PhpQueueParams) => Promise<PhpRuntimeValue>;
declare type PhpActionHandler = (...params: PhpQueueParams) => PhpRuntimeValue | Promise<PhpRuntimeValue>;
declare type PhpEventHook = (event: Event) => boolean | void;
declare type PhpRuntimeHook = (request: RuntimeRequest, response?: Response) => void;
declare type PhpNotFoundHook = (request: RuntimeRequest) => Response | string | undefined;
declare type PhpSharedValue = object | string | number | boolean | PhpActionHandler | undefined;

declare type OutputTarget = EventTarget;

declare type RuntimeRequest = Request | {
	url: string | URL,
	method?: string,
	headers?: Headers | Map<string, string> | Record<string, string>,
	connection?: { encrypted?: boolean },
	socket?: { encrypted?: boolean }
};

declare interface RuntimeLifecycleEvent {
	waitUntil(promise: Promise<void>): void;
}

declare interface RuntimeFetchEvent {
	request: Request;
	respondWith(response: Response | Promise<Response>): void;
}

declare interface PhpSharedLibrary {
	name?: string;
	url: string | URL;
	ini?: boolean;
	getLibs?: Function;
	getFiles?: Function;
}

declare interface PhpVhost {
	pathPrefix: string;
	directory: string;
	entrypoint: string;
}

declare type PhpLibraryList = Array<string | URL | PhpSharedLibrary>;
declare type PhpPreloadFileList = PhpPreloadFile[];
declare type PhpVhostList = PhpVhost[];

declare interface PhpPreloadFile {
	url: string | URL;
	path?: string;
	parent?: string;
	name?: string;
}

declare interface PhpRuntimeArgs {
	autoTransaction?: boolean;
	version?: PhpRuntimeVersion;
	variant?: PhpRuntimeVariant;
	interactive?: boolean;
	script?: string;
	code?: string;
	shared?: Record<string, PhpSharedValue>;
	locateFile?: (path: string, directory?: string) => string | URL | undefined;
	files?: PhpPreloadFileList;
	sharedLibs?: PhpLibraryList;
	dynamicLibs?: PhpLibraryList;
	debug?: boolean;
	ini?: string;
	persist?: object;
	staticFS?: boolean;
	vHosts?: PhpVhostList;
	[key: string]: object | string | number | boolean | Function | undefined;
}

declare module './php*.mjs' {
	const PhpBinary: new (args: object) => object;
	export default PhpBinary;
}

declare module './php-worker' {
	const PhpBinary: Promise<PhpModuleFactory>;
	export default PhpBinary;
}

declare module 'php-wasm/php*.mjs' {
	const PhpBinary: new (args: object) => object;
	export default PhpBinary;
}

declare module 'php-wasm/php-worker.mjs' {
	const PhpBinary: Promise<PhpModuleFactory>;
	export default PhpBinary;
}

declare module 'php-wasm/PhpBase' {
	export class PhpBase extends EventTarget {
		constructor(phpBinLoader: Promise<PhpModuleFactory>, args?: PhpRuntimeArgs, sapi?: string);
		binary: Promise<{
			inputDataQueue?: string[],
			awaitingInput?: ((value: string | undefined) => void) | null,
			triggerStdin?: () => void,
			persist?: boolean,
			ccall?: Function,
			lengthBytesUTF8?: Function,
			_malloc?: Function,
			_free?: Function,
			stringToUTF8?: Function,
			setValue?: Function,
			UTF8ToString?: Function,
			getValue?: Function,
			HEAP8?: Int8Array,
			hasVrzno?: boolean,
			zvalToJS?: Function,
			onRefresh?: Set<Function>,
			FS?: {
				syncfs?: (populate: boolean, callback: (error?: Error) => void) => void
			} & object
		}>;
		queue: Array<[PhpQueuedCallback, PhpQueueParams, PhpQueueResolve, PhpQueueReject]>;
		autoTransaction: boolean;
		transactionStarted: boolean | Promise<void>;
		flush(): void;
		refresh(): Promise<PhpRuntimeValue>;
	}
}
