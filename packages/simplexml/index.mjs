import simplexml8_4 from './8.4.mjs';
import simplexml8_3 from './8.3.mjs'; 
// import simplexml8_2 from './8.2.mjs'; 
// import simplexml8_1 from './8.1.mjs'; 
// import simplexml8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': simplexml8_4,
	'8.3': simplexml8_3,
	// '8.2': simplexml8_2,
	// '8.1': simplexml8_1,
	// '8.0': simplexml8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
