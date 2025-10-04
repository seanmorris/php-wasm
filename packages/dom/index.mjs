import dom8_4 from './8.4.mjs';
import dom8_3 from './8.3.mjs'; 
// import dom8_2 from './8.2.mjs'; 
// import dom8_1 from './8.1.mjs'; 
// import dom8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': dom8_4,
	'8.3': dom8_3,
	// '8.2': dom8_2,
	// '8.1': dom8_1,
	// '8.0': dom8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
