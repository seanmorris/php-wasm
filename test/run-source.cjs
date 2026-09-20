const test = require('node:test');
const {PhpNode} = require('./lib/PhpNode.cjs');

test('CommonJS run preserves PHP source semantics', async t => {
	const {testRunSources} = await import('./lib/run-source-cases.mjs');
	await testRunSources(PhpNode, t.test.bind(t));
});
