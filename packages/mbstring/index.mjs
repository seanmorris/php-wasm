import mbstring8_4 from './8.4.mjs';
import mbstring8_3 from './8.3.mjs'; 
// import mbstring8_2 from './8.2.mjs'; 
// import mbstring8_1 from './8.1.mjs'; 
// import mbstring8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': mbstring8_4,
	'8.3': mbstring8_3,
	// '8.2': mbstring8_2,
	// '8.1': mbstring8_1,
	// '8.0': mbstring8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
