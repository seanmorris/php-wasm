import phar8_4 from './8.4.mjs';
// import phar8_3 from './8.3'; 
// import phar8_2 from './8.2'; 
// import phar8_1 from './8.1'; 
// import phar8_0 from './8.0'; 

const versionTable = {
	'8.4': phar8_4,
	'8.3': phar8_3,
	// '8.2': phar8_2,
	// '8.1': phar8_1,
	// '8.0': phar8_0,
};

export default {
	getLibs: php => versionTable[php.phpVersion]
};
