import {PhpCgiWorker} from 'php-cgi-wasm/PhpCgiWorker.mjs';
import Libxml from 'php-wasm-libxml';
import Zlib from 'php-wasm-zlib';
import Libzip from 'php-wasm-libzip';
import program from '../scripts/editor-archive.php?raw';
import {libType} from './runtimePaths';
import {sharedSupportLibs} from 'demo-web-shared-support-libs';

/** Archive processing uses an isolated temporary filesystem, never persistent PHP files. */
self.onmessage = async event => {
	try
	{
		const {mode, input} = event.data;
		const sharedLibs = libType === 'dynamic' ? [Libxml, Zlib, Libzip] : libType === 'shared' ? sharedSupportLibs : [];
		const php = new PhpCgiWorker({persist: false, sharedLibs, docroot: '/work', prefix: '/editor-archive/', staticCacheTime: 0});
		const {FS} = await php.binary;
		if(!FS.analyzePath('/config').exists) FS.mkdir('/config');
		FS.mkdir('/work');
		FS.mkdir('/work/files');
		let manifest = [];
		if(mode === 'pack')
		{
			manifest = input.map((entry, index) => ({name: entry.name, directory: !!entry.directory, index}));
			for(const [index, entry] of input.entries()) if(!entry.directory) FS.writeFile('/work/files/' + index, entry.bytes);
		}
		else if(mode === 'unpack') FS.writeFile('/work/input.zip', input);
		else throw new Error('Unknown archive operation.');
		FS.writeFile('/work/request.json', JSON.stringify({mode, manifest}));
		FS.writeFile('/work/archive.php', program);
		const response = await php.request(new Request(new URL('/editor-archive/archive.php', self.location.href)));
		if(!response.ok || !FS.analyzePath('/work/result.json').exists) throw new Error('Archive processing failed: ' + (await response.text()).slice(0, 500));
		const output = JSON.parse(new TextDecoder().decode(FS.readFile('/work/result.json')));
		if(output.error) throw new Error(output.error);
		const result = mode === 'pack' ? FS.readFile('/work/output.zip') : output.entries.map(entry => ({name: entry.name, directory: entry.directory, ...(entry.directory ? {} : {bytes: FS.readFile('/work/files/' + entry.index)})}));
		self.postMessage({result});
	}
	catch(error)
	{
		self.postMessage({error: error.message || String(error)});
	}
};
