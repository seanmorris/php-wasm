export interface PhpPreloadFile { url: string | URL; path?: string; parent?: string; name?: string; }
export interface PhpSharedLibrary { name?: string; url: string | URL; ini?: boolean; getLibs?: () => PhpSharedLibrary[]; getFiles?: () => PhpPreloadFile[]; }
export function getLibs(): PhpSharedLibrary[];
declare const _default: { getLibs: typeof getLibs };
export default _default;
