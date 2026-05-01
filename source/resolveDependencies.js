/**
 * A preload file definition.
 * @typedef {object} FileDef
 * @property {string} url URL used to preload the file.
 * @property {string} path Virtual filesystem path where the file should be mounted.
 * @property {string} [name] Optional explicit filename for the mounted file.
 */

/**
 * A shared library dependency definition.
 * @typedef {string|object} LibDef
 * @property {string} [name] Shared library filename.
 * @property {string|URL} [url] URL used to preload the shared library.
 * @property {boolean} [ini] Indicates whether the library should be loaded via `php.ini`.
 * @property {(wrapper: object) => LibDef[]} [getLibs] Returns additional dependent shared libraries.
 * @property {(wrapper: object) => FileDef[]} [getFiles] Returns additional dependent preload files.
 */

/**
 * An object representing files, libs and urlLibs for a shared library.
 * @typedef {object} ResolvedDependencies
 * @property {FileDef[]} files Normalized preload file definitions.
 * @property {LibDef[]} libs Normalized shared library definitions.
 * @property {{[key: string]: string|URL}} urlLibs Mapping of resource names to URLs.
 */

/**
 * Resolves dependencies related to dynamically loaded shared libs.
 * Normalizes LibDefs & FileDefs, and extracts URLs to specified resources.
 * @param {LibDef[]} sharedLibs List of LibDefs to resolve dependencies for.
 * @param {object} wrapper PHP object to resolve dependencies for.
 * @returns {ResolvedDependencies} Normalized LibDefs, FileDefs, and their URLs.
 */
export const resolveDependencies = (sharedLibs, wrapper) => {
	const _files = [];
	const _libs = [];

	(sharedLibs || []).flat().forEach(libDef => {
		if(typeof libDef === 'object')
		{
			if(typeof libDef.getLibs === 'function')
			{
				_libs.push(...libDef.getLibs(wrapper));
			}
			else
			{
				_libs.push(libDef);
			}

			if(typeof libDef.getFiles === 'function')
			{
				_files.push(...libDef.getFiles(wrapper));
			}
		}
		else
		{
			_libs.push(libDef);
		}
	});

	const files = _files.map(fileDef => {
		const url = new URL(fileDef.url).href;
		const path = fileDef.path;
		const name = fileDef.name || path.split('/').pop();
		const parent = path.substr(0, path.length - name.length);
		return {parent, name, url};
	});

	const urlLibs = {};

	const libs = _libs.map(libDef => {
		if(typeof libDef === 'string' || libDef instanceof URL)
		{
			libDef = String(libDef);

			if(libDef.substr(0, 1) == '/'
				|| libDef.substr(0, 2) == './'
				|| libDef.substr(0, 2) == '../'
				|| libDef.substr(0, 8) == 'https://'
				|| libDef.substr(0, 7) == 'http://'
				|| libDef.substr(0, 7) == 'file://'
			){
				const name = libDef.split('/').pop();
				const url  = libDef;
				urlLibs[ name ] = url;

				return {name, url, ini: true};
			}

			return libDef;
		}
		else if(typeof libDef === 'object')
		{
			const name = libDef.name ?? String(libDef.url).split('/').pop();
			urlLibs[ name ] = String(libDef.url);
			libDef.url = String(libDef.url);
			return libDef;
		}
	});

	return {files, libs, urlLibs};
};
