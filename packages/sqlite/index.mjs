import sqlite8_4 from './8.4.mjs';
import sqlite8_3 from './8.3.mjs'; 
import sqlite8_2 from './8.2.mjs'; 
import sqlite8_1 from './8.1.mjs'; 
import sqlite8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': sqlite8_4,
	'8.3': sqlite8_3,
	'8.2': sqlite8_2,
	'8.1': sqlite8_1,
	'8.0': sqlite8_0,
};

export const getLibs = php => versionTable[php.phpVersion].getLibs()

export default {getLibs};
