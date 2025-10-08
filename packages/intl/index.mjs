import intl8_4 from './8.4.mjs';
import intl8_3 from './8.3.mjs'; 
import intl8_2 from './8.2.mjs'; 
import intl8_1 from './8.1.mjs'; 
import intl8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': intl8_4,
	'8.3': intl8_3,
	'8.2': intl8_2,
	'8.1': intl8_1,
	'8.0': intl8_0,
};

export const getLibs  = php => versionTable[php.phpVersion].getLibs();
export const getFiles = php => versionTable[php.phpVersion].getFiles();

export default { getLibs, getFiles };
