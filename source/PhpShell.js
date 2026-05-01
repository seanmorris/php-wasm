import { PhpBase } from './PhpBase';

const defaultVersion = '8.4';

/**
 * Shell-oriented PHP wrapper.
 */
export class PhpShell extends PhpBase
{
	/**
	 * Creates a shell-oriented PHP runtime.
	 * @param {object} args Runtime configuration.
	 */
	constructor(args = {})
	{
		super(import(`./php${args.version ?? defaultVersion}-node.mjs`), args);

	}
}
