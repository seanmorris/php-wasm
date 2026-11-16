import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {randomUUID} from 'node:crypto';

const source = await fs.readFile(new URL('../source/php-tags.mjs', import.meta.url), 'utf8');
const fixture = async (t, readyState, hasBody, autoReady = true) => {
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
	const instances = [];
	class Element
	{
		innerText = '';
		attributes = new Map();
		hasAttribute(name)
		{return this.attributes.has(name);}
		getAttribute(name)
		{return this.attributes.get(name) ?? null;}
		setAttribute(name, value)
		{this.attributes.set(name, String(value));}
		matches()
		{return true;}
	}
	class PhpWeb extends EventTarget
	{
		constructor()
		{
			super();
			instances.push(this);
			if(autoReady) queueMicrotask(() => this.dispatchEvent(new Event('ready')));
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
	replace('window', {});
	replace('document', doc);
	replace('Element', Element);
	replace('MutationObserver', MutationObserver);
	replace('__phpTagsFixtureRuntime', PhpWeb);
	const code = source.replace("import { PhpWeb } from './PhpWeb.mjs';", 'const PhpWeb = globalThis.__phpTagsFixtureRuntime;');
	assert.notEqual(code, source);
	const load = () => import(`data:text/javascript;base64,${Buffer.from(code + `\n//# sourceURL=php-tags-fixture-${randomUUID()}.mjs`).toString('base64')}`);
	return {doc, script, runs, observers, instances, Element, load, replace};
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

for(const [label, value, name] of [
	['bare attribute', '', 'php'],
	['custom name', 'phpInstance', 'phpInstance'],
	['literal true value', 'true', 'true']
])
{
	test(`window binding supports ${label}`, async t => {
		const f = await fixture(t, 'complete', true);
		f.script.setAttribute('data-bind-php-window', value);
		await f.load();
		await tick();
		assert.equal(window[name], f.instances[0]);
		assert.deepEqual(Object.keys(window), [name]);
	});
}

test('tags without a binding attribute do not expose a global', async t => {
	const f = await fixture(t, 'complete', true);
	await f.load();
	await tick();
	assert.equal(f.instances.length, 1);
	assert.deepEqual(Object.keys(window), []);
});

test('binding is available before runtime readiness and initial execution', async t => {
	const f = await fixture(t, 'complete', true, false);
	f.script.setAttribute('data-bind-php-window', 'phpInstance');
	f.script.innerText = '<?php echo "ready";';
	await f.load();
	await tick();
	assert.equal(window.phpInstance, f.instances[0]);
	assert.deepEqual(f.runs, []);
	window.phpInstance.dispatchEvent(new Event('ready'));
	await tick();
	assert.deepEqual(f.runs, ['<?php echo "ready";']);
});

test('subsequent tags overwrite existing globals with the same binding name', async t => {
	const f = await fixture(t, 'complete', true);
	window.php = {existing: true};
	f.script.setAttribute('data-bind-php-window', '');
	await f.load();
	await tick();
	assert.equal(window.php, f.instances[0]);
	const added = new f.Element();
	added.setAttribute('data-bind-php-window', '');
	f.observers[0].callback([{addedNodes: [added]}]);
	await tick();
	assert.equal(window.php, f.instances[1]);
});

test('src loading delays binding and may overwrite a later tag when it completes', async t => {
	const f = await fixture(t, 'complete', true);
	let resolveResponse;
	f.replace('fetch', url => {
		assert.equal(url, '/script.php');
		return new Promise(resolve => {resolveResponse = resolve;});
	});
	f.script.setAttribute('src', '/script.php');
	f.script.setAttribute('data-bind-php-window', 'phpInstance');
	await f.load();
	await tick();
	assert.equal(window.phpInstance, undefined);
	const added = new f.Element();
	added.setAttribute('data-bind-php-window', 'phpInstance');
	added.innerText = 'inline';
	f.observers[0].callback([{addedNodes: [added]}]);
	await tick();
	const inlineInstance = window.phpInstance;
	assert.equal(inlineInstance, f.instances[0]);
	resolveResponse({text: async () => 'external'});
	await tick();
	assert.equal(window.phpInstance, f.instances[1]);
	assert.notEqual(window.phpInstance, inlineInstance);
	assert.deepEqual(f.runs, ['inline', 'external']);
});
