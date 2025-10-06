import { PhpCgiWebBase } from './PhpCgiWebBase';

const defaultVersion = '8.4';

export class PhpCgiWeb extends PhpCgiWebBase
{
	constructor({version, docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version ?? defaultVersion}-cgi-web.mjs`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
