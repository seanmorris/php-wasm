import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {randomUUID} from 'node:crypto';

const source = await fs.readFile(new URL('../source/php-tags.mjs', import.meta.url), 'utf8');
const fixture = async (t, readyState, hasBody) => {
	const originals = new Map();
	const replace = (name, value) => {
		originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
	};
	t.after(() => {
		for(const [name, descriptor] of originals)
		{
			if(descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	});
	const runs = [];
	const observers = [];
	class Element
	{
		innerText = '';
		hasAttribute()
		{return false;}
		matches()
		{return true;}
	}
	class PhpWeb extends EventTarget
	{
		constructor()
		{
			super();
			queueMicrotask(() => this.dispatchEvent(new Event('ready')));
		}
		inputString() {}
		flush() {}
		async run(code)
		{runs.push(code); return 0;}
	}
	class MutationObserver
	{
		constructor(callback)
		{this.callback = callback; observers.push(this);}
		observe() {}
	}
	const script = new Element();
	const doc = Object.assign(new EventTarget(), {
		readyState, body: hasBody ? {parentElement: {}} : null
		, querySelectorAll: () => doc.body ? [script] : []
	});
	replace('document', doc);
	replace('Element', Element);
	replace('MutationObserver', MutationObserver);
	replace('__phpTagsFixtureRuntime', PhpWeb);
	const code = source.replace("import { PhpWeb } from './PhpWeb.mjs';", 'const PhpWeb = globalThis.__phpTagsFixtureRuntime;');
	assert.notEqual(code, source);
	const load = () => import(`data:text/javascript;base64,${Buffer.from(code + '\n//# sourceURL=php-tags-fixture.mjs').toString('base64')}#${randomUUID()}`);
	return {doc, script, runs, observers, Element, load};
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('async PHP tags loaded before body wait for the complete initial document', async t => {
	const f = await fixture(t, 'loading', false);
	await f.load();
	assert.deepEqual(f.runs, []);
	f.doc.body = {parentElement: {}};
	f.script.innerText = '<?php echo "complete";';
	f.doc.readyState = 'interactive';
	f.doc.dispatchEvent(new Event('DOMContentLoaded'));
	await tick();
	assert.deepEqual(f.runs, ['<?php echo "complete";']);
});

test('initial script text is not captured while HTML parsing is incomplete', async t => {
	const f = await fixture(t, 'loading', true);
	await f.load();
	await tick();
	assert.deepEqual(f.runs, []);
	f.script.innerText = '<?php echo "finished parsing";';
	f.doc.readyState = 'interactive';
	f.doc.dispatchEvent(new Event('DOMContentLoaded'));
	await tick();
	assert.deepEqual(f.runs, ['<?php echo "finished parsing";']);
});

test('already-parsed documents and subsequently inserted PHP tags still execute once', async t => {
	const f = await fixture(t, 'complete', true);
	f.script.innerText = '<?php echo "initial";';
	await f.load();
	await tick();
	const added = new f.Element();
	added.innerText = '<?php echo "added";';
	f.observers[0].callback([{addedNodes: [added]}]);
	await tick();
	assert.deepEqual(f.runs, ['<?php echo "initial";', '<?php echo "added";']);
});
