import type { PhpCgiRuntimeArgs, RuntimeRequest } from './public.d.ts';
import { PhpCgiBase } from './PhpCgiBase.mjs';

export class PhpCgiNode extends PhpCgiBase {
	constructor(args?: PhpCgiRuntimeArgs);
	request(request: RuntimeRequest): Promise<Response | string | undefined>;
}
