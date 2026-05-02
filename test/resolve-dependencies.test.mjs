import test from 'node:test';
import assert from 'node:assert/strict';

import { lookupDependencyUrl } from '../packages/php-wasm/resolveDependencies.mjs';

test('lookupDependencyUrl preserves the mapped URL for bare names', () => {
	const hashedUrl = 'http://example.test/assets/libicui18n-DOzRtIjK.so';
	const urlLibs = {'libicui18n.so': hashedUrl};

	assert.equal(lookupDependencyUrl(urlLibs, 'libicui18n.so'), hashedUrl);
});

test('lookupDependencyUrl resolves path-style loader lookups back to the mapped bare name', () => {
	const hashedUrl = 'http://example.test/assets/libicui18n-DOzRtIjK.so';
	const urlLibs = {'libicui18n.so': hashedUrl};

	assert.equal(
		lookupDependencyUrl(urlLibs, '/php-wasm/assets/libicui18n.so'),
		hashedUrl
	);
});

test('lookupDependencyUrl ignores query strings and fragments when matching a provided name', () => {
	const hashedUrl = 'http://example.test/assets/libicui18n-DOzRtIjK.so';
	const urlLibs = {'libicui18n.so': hashedUrl};

	assert.equal(
		lookupDependencyUrl(urlLibs, 'libicui18n.so?cache=bust#fragment'),
		hashedUrl
	);
});
