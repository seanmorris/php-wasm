import fileinfo8_5 from './8.5.mjs';
import fileinfo8_4 from './8.4.mjs';
import fileinfo8_3 from './8.3.mjs';
import fileinfo8_2 from './8.2.mjs';
import fileinfo8_1 from './8.1.mjs';
import fileinfo8_0 from './8.0.mjs';

const versionTable = {
	'8.5': fileinfo8_5
	, '8.4': fileinfo8_4
	, '8.3': fileinfo8_3
	, '8.2': fileinfo8_2
	, '8.1': fileinfo8_1
	, '8.0': fileinfo8_0
};

/**
 * Returns the shared library definitions for the active PHP version.
 * @param {object} php PHP runtime wrapper used to select the versioned package build.
 * @returns {Array<object>} Shared library definitions for the active PHP version.
 */
export const getLibs = php => versionTable[php.phpVersion].getLibs();

export default {getLibs};
