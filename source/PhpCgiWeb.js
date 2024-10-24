import { PhpCgiWebBase } from './PhpCgiWebBase';
import PHP from './php-cgi-worker';

export class PhpCgiWeb extends PhpCgiWebBase
{
	constructor({docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args} = {})
	{
		super(PHP, {docroot, prefix, rewrite, cookies, types, onRequest, notFound, ...args});
	}
}
