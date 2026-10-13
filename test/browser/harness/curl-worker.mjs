import {PhpCgiWebBase} from '/packages/php-cgi-wasm/PhpCgiWebBase.mjs';
import curl from '/packages/curl/index.mjs';
import {loadCgiSharedLibs} from './runtime-libs.mjs';

self.onmessage = async ({data: {version, libType, curlMode}}) => {
	try
	{
		const cgi = new PhpCgiWebBase(import(`/packages/php-cgi-wasm/php${version}-cgi-worker.mjs`), {
			version, docroot: '/preload', prefix: '/cgi/'
			, sharedLibs: [...loadCgiSharedLibs(libType), ...(curlMode === 'static' ? [] : [curl])]
			, libcurlFetchOptions: {credentials: 'omit'}
		});
		const binary = await cgi.binary;
		binary.FS.writeFile('/preload/curl.php', `<?php
			$ch = curl_init(${JSON.stringify(new URL('/php-wasm/curl/echo', location.href).href)});
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			$data = json_decode(curl_exec($ch), true);
			echo json_encode([extension_loaded('curl'), $data['method'], $data['headers']['cookie'] ?? '']);
		`);
		const response = await cgi.request(new Request(new URL('/cgi/curl.php', location.href)));
		self.postMessage({status: response.status, data: await response.json(), requests: binary.libcurlFetch.requests.size});
	}
	catch(error)
	{ self.postMessage({error: String(error), stack: error.stack}); }
};
