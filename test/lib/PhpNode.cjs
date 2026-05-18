const { PhpNode: BasePhpNode } = require('php-wasm/PhpNode');
const { nodeRuntimeOptions } = require('./node-runtime-options.cjs');

class PhpNode extends BasePhpNode
{
	constructor(args = {})
	{
		super(nodeRuntimeOptions({ runtime: 'php', ...args }));
	}
}

module.exports = {
	PhpNode,
};
