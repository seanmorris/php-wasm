import assert from 'node:assert/strict';
import test from 'node:test';
import {PhpCgiBase} from '../source/PhpCgiBase.mjs';

const jar = cookies => new PhpCgiBase(new Promise(() => {}), {cookies}).cookieJar;
const clock = t => {
	const original = Date.now;
	let now = 1800000000000;
	Date.now = () => now;
	t.after(() => Date.now = original);
	return milliseconds => now += milliseconds;
};

test('cookie snapshots preserve the original deadline through repeated restarts', t => {
	const advance = clock(t);
	const first = jar('session=hello; Max-Age=60; Path=/');
	const snapshot = first.dump();
	const saved = JSON.parse(snapshot);
	assert.equal(saved.version, 1);
	assert.equal(saved.cookies[0].expiresAt, Date.now() + 60000);
	advance(20000);
	const second = jar();
	second.load(snapshot);
	assert.equal(second.toEnv(), 'session=hello');
	assert.equal(JSON.parse(second.dump()).cookies[0].expiresAt, saved.cookies[0].expiresAt);
	advance(40000);
	const third = jar();
	third.load(second.dump());
	assert.equal(third.toEnv(), '');
	assert.deepEqual(JSON.parse(third.dump()).cookies, []);
	advance(60000);
	third.load(snapshot);
	assert.equal(third.toEnv(), '');
});

test('cookie overwrite, deletion, and Max-Age precedence survive persistence', t => {
	clock(t);
	const first = jar();
	first.store('key=first; Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
	assert.equal(first.toEnv(), 'key=first');
	first.store('key=second; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=120');
	const restored = jar();
	restored.load(first.dump());
	assert.equal(restored.toEnv(), 'key=second');
	restored.store('key=deleted; Expires=Sat, 01 Jan 2100 00:00:00 GMT; Max-Age=0');
	assert.equal(restored.toEnv(), '');
	assert.deepEqual(JSON.parse(restored.dump()).cookies, []);
});

test('legacy jars discard unknown relative lifetimes while retaining known lifetimes and session cookies', t => {
	clock(t);
	const restored = jar();
	restored.load([
		'unknown=old; Max-Age=3600'
		, 'unknownWithExpires=old; Max-Age=60; Expires=Sat, 01 Jan 2100 00:00:00 GMT'
		, 'absolute=keep; Expires=Sat, 01 Jan 2100 00:00:00 GMT'
		, 'session=keep; Path=/site'
		, 'expired=old; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
	].join('\n'));
	assert.equal(restored.toEnv('/site/index.php'), 'absolute=keep;session=keep');
	assert.equal(restored.toEnv('/elsewhere'), 'absolute=keep');
	const fresh = jar('new=keep; Max-Age=60');
	assert.equal(fresh.toEnv(), 'new=keep', 'Constructor headers describe newly received cookies');
});

test('malformed persisted entries do not prevent restoration of valid cookies', t => {
	clock(t);
	const restored = jar();
	for(const malformed of ['{', '[]', '{"version":99,"cookies":[]}', '{"version":1,"cookies":null}'])
	{
		assert.doesNotThrow(() => restored.load(malformed));
		assert.equal(restored.toEnv(), '');
	}
	const valid = JSON.parse(jar('valid=yes; Max-Age=60').dump()).cookies[0];
	restored.load(JSON.stringify({version: 1
	, cookies: [
		null, {}, {raw: 42, created: Date.now(), expiresAt: null}
		, {...valid, raw: 'unknown=no; Max-Age=60', expiresAt: null}
		, {...valid, raw: 'bad=no', created: 'yesterday'}, valid
	]}));
	assert.equal(restored.toEnv(), 'valid=yes');
});
