export type PhpRuntimeVersion = '8.0' | '8.1' | '8.2' | '8.3' | '8.4' | '8.5';

export interface PhpVersionedRuntime {
	phpVersion?: PhpRuntimeVersion;
}

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

export function getLibs(php: PhpVersionedRuntime): PhpSharedLibrary[];

declare const _default: {
	getLibs: typeof getLibs;
};

export default _default;
