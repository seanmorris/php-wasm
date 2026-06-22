import type { PhpCgiRuntimeArgs } from './public';
import { PhpCgiWebBase } from './PhpCgiWebBase.mjs';

export class PhpCgiWorker extends PhpCgiWebBase {
	constructor(args?: PhpCgiRuntimeArgs);
}
