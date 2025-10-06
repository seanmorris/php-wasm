import { PhpCgiWebBase } from './PhpCgiWebBase';

const defaultVersion = '8.4';

export class PhpCgiWebview extends PhpCgiWebBase
{
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(
			import(`./php${version ?? defaultVersion}-cgi-webview.mjs`)
			, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args}
		);
	}
}
