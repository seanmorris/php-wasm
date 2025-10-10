import gd8_4 from './8.4.mjs';
import gd8_3 from './8.3.mjs'; 
import gd8_2 from './8.2.mjs'; 
import gd8_1 from './8.1.mjs'; 
import gd8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': gd8_4,
	'8.3': gd8_3,
	'8.2': gd8_2,
	'8.1': gd8_1,
	'8.0': gd8_0,
};

export const getLibs = php => versionTable[php.phpVersion].getLibs();

export default {getLibs};
