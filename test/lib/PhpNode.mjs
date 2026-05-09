import { PhpNode as BasePhpNode } from '../../packages/php-wasm/PhpNode.mjs';
import { nodeRuntimeOptions } from './node-runtime-options.mjs';

export class PhpNode extends BasePhpNode
{
	constructor(args = {})
	{
		super(nodeRuntimeOptions(args));
	}
}
