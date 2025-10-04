import iconv8_4 from './8.4.mjs';
import iconv8_3 from './8.3.mjs';
// import iconv8_2 from './8.2.mjs'; 
// import iconv8_1 from './8.1.mjs'; 
// import iconv8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': iconv8_4,
	'8.3': iconv8_3,
	// '8.2': iconv8_2,
	// '8.1': iconv8_1,
	// '8.0': iconv8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
