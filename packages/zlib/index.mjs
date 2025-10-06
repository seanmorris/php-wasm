import zlib8_4 from './8.4.mjs';
import zlib8_3 from './8.3.mjs'; 
import zlib8_2 from './8.2'; 
import zlib8_1 from './8.1'; 
import zlib8_0 from './8.0'; 

const versionTable = {
	'8.4': zlib8_4,
	'8.3': zlib8_3,
	'8.2': zlib8_2,
	'8.1': zlib8_1,
	'8.0': zlib8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
