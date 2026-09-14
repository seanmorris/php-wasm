import type { PhpCgiRuntimeArgs, RuntimeRequest } from './public.d.ts';
import type { PhpCgiBase } from './PhpCgiBase.mjs';

export type * from './public.d.ts';

export class PhpCgiNode extends PhpCgiBase {
	constructor(args?: PhpCgiRuntimeArgs);
	request(request: RuntimeRequest): Promise<Response | string | undefined>;
}
