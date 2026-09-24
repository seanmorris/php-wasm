import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';

test('Phar ships its Make fragment and stream regression fixtures', () => {
	const output = execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json', './packages/phar'], {
		cwd: fileURLToPath(new URL('../', import.meta.url))
		, encoding: 'utf8'
	});
	const [packed] = JSON.parse(output);
	const files = new Set(packed.files.map(file => file.path));

	for(const required of [
		'static.mak'
		, 'phar.mak'
		, 'test/basic.mjs'
		, 'test/streams.mjs'
		, 'test/fixtures/sample.phar'
		, 'test/fixtures/webapp.phar'
		, 'test/fixtures/streams.php'
	]){
		assert.ok(files.has(required), `${required} is missing from the Phar npm package`);
	}
});
