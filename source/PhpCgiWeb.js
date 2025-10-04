import { PhpCgiWebBase } from './PhpCgiWebBase';

version = '8.4';

export class PhpCgiWeb extends PhpCgiWebBase
{
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version}-cgi-web`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
