import { PhpCgiBase } from './PhpCgiBase';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const defaultVersion = '8.4';

export class PhpCgiNode extends PhpCgiBase
{
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, version, ...args} = {})
	{
		const locateFile = (name, dir) => {
			if(name.substr(0, 7) === 'file://')
			{
				name = new URL(name).pathname;
			}

			if(dir === '')
			{
				if(typeof __dirname === 'undefined')
				{
					dir = path.dirname(url.fileURLToPath(import.meta.url));
				}
				else
				{
					dir = __dirname;
				}
			}

			const located = path.resolve(path.format({dir, name}));

			if(fs.existsSync(located))
			{
				return located;
			}
		};

		version = version ?? defaultVersion

		super(
			import(`./php${version}-cgi-node.mjs`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, version, locateFile, ...args}
		);
	}

	async request(request)
	{
		const protocol = request.connection.encrypted ? 'https://' : 'http://';

		request.url = new URL(protocol + request.headers.host + request.url);

		request.headers = new Map(Object.entries(request.headers));

		const response = await super.request(request);

		console.error(`[${new Date().toLocaleString()}] [HTTP ${response.status}] ${String(request.method).padStart(5,' ')} ${request.url}`);

		return response;
	}
}
