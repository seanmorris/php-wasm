import openssl8_4 from './8.4.mjs';
import openssl8_3 from './8.3.mjs'; 
import openssl8_2 from './8.2.mjs'; 
import openssl8_1 from './8.1.mjs'; 
import openssl8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': openssl8_4,
	'8.3': openssl8_3,
	'8.2': openssl8_2,
	'8.1': openssl8_1,
	'8.0': openssl8_0,
};

export const getLibs = php => versionTable[php.phpVersion].getLibs(php);

export default {getLibs};
