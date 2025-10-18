import yaml8_4 from './8.4.mjs';
import yaml8_3 from './8.3.mjs'; 
import yaml8_2 from './8.2.mjs'; 
import yaml8_1 from './8.1.mjs'; 
import yaml8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': yaml8_4,
	'8.3': yaml8_3,
	'8.2': yaml8_2,
	'8.1': yaml8_1,
	'8.0': yaml8_0,
};

export const getLibs = php => versionTable[php.phpVersion].getLibs();

export default {getLibs};
