import type { PhpCgiModuleFactory, PhpCgiRuntimeArgs, PhpBinaryRuntime, PhpRuntimeVersion, RuntimeRequest, PhpCgiSettings, PhpPathAnalysis, PhpFileNode, PhpFileStat, PhpReadFileOptions, PhpReadDirectoryOptions, PhpDirectoryEntry } from './public.d.ts';

export type * from './public.d.ts';

export declare class PhpCgiBase {
	constructor(phpBinLoader: Promise<PhpCgiModuleFactory>, args?: PhpCgiRuntimeArgs);
	phpVersion?: PhpRuntimeVersion;
	binary: Promise<PhpBinaryRuntime>;
	refresh(): Promise<PhpBinaryRuntime>;
	request(request: RuntimeRequest): Promise<Response | string | undefined>;
	analyzePath(path: string): Promise<PhpPathAnalysis>;
	readdir(path: string, options?: PhpReadDirectoryOptions & { withFileTypes?: false }): Promise<string[]>;
	readdir(path: string, options: PhpReadDirectoryOptions & { withFileTypes: true }): Promise<PhpDirectoryEntry[]>;
	readdir(path: string, options?: PhpReadDirectoryOptions): Promise<string[] | PhpDirectoryEntry[]>;
	readFile(path: string, options: PhpReadFileOptions & { encoding: 'utf8' }): Promise<string>;
	readFile(path: string, options?: PhpReadFileOptions & { encoding?: 'binary' }): Promise<Uint8Array>;
	readFile(path: string, options?: PhpReadFileOptions): Promise<string | Uint8Array>;
	stat(path: string): Promise<PhpFileStat>;
	mkdir(path: string): Promise<PhpFileNode>;
	rmdir(path: string): Promise<void>;
	rename(path: string, newPath: string): Promise<void>;
	writeFile(path: string, data: string | ArrayBufferView, options?: object): Promise<void>;
	unlink(path: string): Promise<void>;
	putEnv(name: string, value: string): Promise<number>;
	getSettings(): Promise<PhpCgiSettings>;
	setSettings(settings: Partial<PhpCgiSettings>): void;
	getEnvs(): Promise<Record<string, string | undefined>>;
	setEnvs(env: Record<string, string>): void;
	storeInit(): Promise<void>;
	loadInit(binary: object): void;
}
