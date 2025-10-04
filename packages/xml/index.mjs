import xml8_4 from './8.4.mjs';
import xml8_3 from './8.3.mjs'; 
// import xml8_2 from './8.2.mjs'; 
// import xml8_1 from './8.1.mjs'; 
// import xml8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': xml8_4,
	'8.3': xml8_3,
	// '8.2': xml8_2,
	// '8.1': xml8_1,
	// '8.0': xml8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
