import { PhpCgiWebBase } from './PhpCgiWebBase';

const defaultVersion = '8.4';

export class PhpCgiWorker extends PhpCgiWebBase
{
	constructor({version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version ?? defaultVersion}-cgi-worker.mjs`)
			, {version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
