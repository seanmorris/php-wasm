import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';

const setup = async t => {
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
	let bus;
	class Worker extends EventTarget
	{
		state = 'installing';
		messages = [];
		postMessage(message)
		{
			this.messages.push(message);
			if(this.throwOnPost) throw new Error('Cannot clone message');
			queueMicrotask(() => bus.onMessage({data: {re: message.token, result: ['.', '..']}}));
		}
		transition(state)
		{
			this.state = state;
			this.dispatchEvent(new Event('statechange'));
		}
	}
	const worker = new Worker();
	const registration = Object.assign(new EventTarget(), {installing: worker, waiting: null, active: null});
	replace('ServiceWorker', Worker);
	replace('window', {crypto: {randomUUID}});
	replace('navigator', {serviceWorker: {getRegistration: async () => registration}});
	bus = await import(`../source/msg-bus.mjs?test=${randomUUID()}`);
	return {worker, registration, ...bus};
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deadline = async promise => {
	let timer;
	try
	{
		return await Promise.race([
			promise
			, new Promise((_, reject) => timer = setTimeout(() => reject(new Error('Message remained pending after activation')), 100))
		]);
	}
	finally
	{clearTimeout(timer);}
};

test('first RPC observes an already-installing worker through every activation state', async t => {
	const {worker, registration, sendMessageFor} = await setup(t);
	const reply = sendMessageFor('/sw.mjs')('readdir', ['/persist']);
	await tick();
	assert.equal(worker.messages.length, 0);
	worker.transition('installed');
	registration.installing = null;
	registration.active = worker;
	worker.transition('activating');
	assert.equal(worker.messages.length, 0);
	worker.transition('activated');
	assert.deepEqual(await deadline(reply), ['.', '..']);
	assert.equal(worker.messages.length, 1);
});

test('direct worker targets wait for activation and active registrations answer immediately', async t => {
	const {worker, registration, sendMessageFor} = await setup(t);
	worker.state = 'activating';
	const reply = sendMessageFor(worker)('readdir', ['/persist']);
	await tick();
	assert.equal(worker.messages.length, 0);
	worker.transition('activated');
	assert.deepEqual(await deadline(reply), ['.', '..']);
	registration.active = worker;
	assert.deepEqual(await sendMessageFor('/sw.mjs')('readdir', ['/persist']), ['.', '..']);
});

test('missing registrations and failed installations reject callers', async t => {
	const {worker, sendMessageFor} = await setup(t);
	const reply = sendMessageFor('/sw.mjs')('readdir');
	const rejected = assert.rejects(reply, /redundant|activat|install/i);
	await tick();
	worker.transition('redundant');
	await deadline(rejected);
	navigator.serviceWorker.getRegistration = async () => undefined;
	await assert.rejects(sendMessageFor('/missing.mjs')('readdir'), /registration/i);
	navigator.serviceWorker.getRegistration = async () => ({active: null, waiting: null, installing: null});
	await assert.rejects(sendMessageFor('/empty.mjs')('readdir'), /no available worker/i);
});

test('registration lookup and message-cloning failures reject without blocking later RPCs', async t => {
	const {worker, registration, sendMessageFor} = await setup(t);
	navigator.serviceWorker.getRegistration = async () => {throw new Error('Lookup failed');};
	await assert.rejects(sendMessageFor('/sw.mjs')('readdir'), /Lookup failed/);
	navigator.serviceWorker.getRegistration = async () => registration;
	registration.active = worker;
	worker.state = 'activated';
	worker.throwOnPost = true;
	await assert.rejects(sendMessageFor('/sw.mjs')('writeFile'), /Cannot clone message/);
	worker.throwOnPost = false;
	assert.deepEqual(await sendMessageFor('/sw.mjs')('readdir'), ['.', '..']);
});
