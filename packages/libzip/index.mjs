import zip8_4 from './8.4.mjs';
import zip8_3 from './8.3.mjs'; 
// import zip8_2 from './8.2'; 
// import zip8_1 from './8.1'; 
// import zip8_0 from './8.0'; 

const versionTable = {
	'8.4': zip8_4,
	'8.3': zip8_3,
	// '8.2': zip8_2,
	// '8.1': zip8_1,
	// '8.0': zip8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
