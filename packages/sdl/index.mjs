import sdl8_4 from './8.4.mjs';
import sdl8_3 from './8.3.mjs'; 
import sdl8_2 from './8.2.mjs'; 
import sdl8_1 from './8.1.mjs'; 
import sdl8_0 from './8.0.mjs'; 

const versionTable = {
	'8.4': sdl8_4,
	'8.3': sdl8_3,
	'8.2': sdl8_2,
	'8.1': sdl8_1,
	'8.0': sdl8_0,
};

export const getLibs = php => versionTable[php.phpVersion].getLibs()

export default {getLibs};
