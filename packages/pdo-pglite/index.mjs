import extension8_5 from './8.5.mjs';
import extension8_4 from './8.4.mjs';
import extension8_3 from './8.3.mjs';
import extension8_2 from './8.2.mjs';
import extension8_1 from './8.1.mjs';

const versionTable = {
	'8.5': extension8_5
	, '8.4': extension8_4
	, '8.3': extension8_3
	, '8.2': extension8_2
	, '8.1': extension8_1
};

/**
 * Returns shared-library definitions for the active PHP version.
 * @param {object} php PHP runtime wrapper used to select the versioned package build.
 * @returns {Array<object>} Shared-library definitions for the active PHP version.
 */
export const getLibs = php => {
	const extension = versionTable[php.phpVersion];

	if(!extension)
	{
		throw new Error(`pdo-pglite does not support PHP ${php.phpVersion}.`);
	}

	return extension.getLibs();
};

export default {getLibs};
