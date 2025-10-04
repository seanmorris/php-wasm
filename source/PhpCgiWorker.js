import { PhpCgiWebBase } from './PhpCgiWebBase';

const version = '8.4';

export class PhpCgiWorker extends PhpCgiWebBase
{
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version}-cgi-worker`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
