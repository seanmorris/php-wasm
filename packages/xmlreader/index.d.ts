export interface SharedLibraryDefinition {
	name?: string;
	url: URL | string;
	ini?: boolean;
}

export function getLibs(php: { phpVersion: string }): SharedLibraryDefinition[];

declare const xmlreader: {
	getLibs: typeof getLibs;
};

export default xmlreader;
