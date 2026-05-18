import intl8_5 from './8.5.mjs';
import intl8_4 from './8.4.mjs';
import intl8_3 from './8.3.mjs';
import intl8_2 from './8.2.mjs';
import intl8_1 from './8.1.mjs';
import intl8_0 from './8.0.mjs';

const versionTable = {
	'8.5': intl8_5
	, '8.4': intl8_4
	, '8.3': intl8_3
	, '8.2': intl8_2
	, '8.1': intl8_1
	, '8.0': intl8_0
};

/**
 * Returns the shared library definitions for the active PHP version.
 * @param {object} php PHP runtime wrapper used to select the versioned package build.
 * @returns {Array<object>} Shared library definitions for the active PHP version.
 */
export const getLibs  = php => versionTable[php.phpVersion].getLibs();
/**
 * Returns preload file definitions for the active PHP version.
 * @param {object} php PHP runtime wrapper used to select the versioned package build.
 * @returns {Array<object>} Preload file definitions for the active PHP version.
 */
export const getFiles = php => versionTable[php.phpVersion].getFiles();

export default { getLibs, getFiles };
