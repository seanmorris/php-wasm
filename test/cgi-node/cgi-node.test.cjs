const { test } = require('node:test');
const { strict: assert } = require('node:assert');

const version = process.env.PHP_VERSION ?? '8.4';
const baseUrl = `http://127.0.0.1:${Number(process.env.CGI_NODE_TEST_PORT ?? 9001)}/php-wasm/cgi-bin/test`;
const fetchText = path => fetch(`${baseUrl}/${path}`).then(response => response.text());
const fetchCookies = async () => JSON.parse(await fetchText('issue53-cookies.php'));

test('renders the CGI hello world demo', async () => {
	const phpOutput = await fetchText('hello-world.php');

	assert.equal(phpOutput, 'Hello, world!\n');
});

test('serves the expected PHP version through CGI', async () => {
	const phpOutput = await fetchText('version.php');

	assert.equal(phpOutput, version);
});

test('retains cookies with a positive Max-Age across requests', async () => {
	assert.equal(await fetchText('issue53-set-max-age-cookie.php'), 'ttl-set');

	const cookies = await fetchCookies();

	assert.equal(cookies.issue53_ttl, 'keep-me');
});

test('deletes cookies from request state and the persisted jar', async () => {
	assert.equal(await fetchText('issue53-set-cookie.php'), 'session-set');
	assert.equal((await fetchCookies()).issue53_session, 'test-session');

	assert.equal(await fetchText('issue53-delete-cookie.php'), 'session-deleted');

	const cookies = await fetchCookies();
	const cookieJar = await fetchText('issue53-cookie-jar.php');

	assert.equal(cookies.issue53_session, undefined);
	assert.doesNotMatch(cookieJar, /issue53_session=/);
	assert.doesNotMatch(cookieJar, /deleted/);
});

test('uses the active cookie entry after overwrite and delete cycles', async () => {
	assert.equal(await fetchText('issue53-set-replace-cookie.php'), 'replace-first');
	assert.equal((await fetchCookies()).issue53_replace, 'first-value');

	assert.equal(await fetchText('issue53-overwrite-replace-cookie.php'), 'replace-second');
	assert.equal((await fetchCookies()).issue53_replace, 'second-value');

	assert.equal(await fetchText('issue53-delete-replace-cookie.php'), 'replace-deleted');

	const cookies = await fetchCookies();
	const cookieJar = await fetchText('issue53-cookie-jar.php');

	assert.equal(cookies.issue53_replace, undefined);
	assert.doesNotMatch(cookieJar, /issue53_replace=/);
});
