import { PhpBase } from './PhpBase';

const defaultVersion = '8.4';

export class PhpShell extends PhpBase
{
	constructor(args = {})
	{
		super(import(`./php${args.version ?? defaultVersion}-node.mjs`), args);

	}
}
