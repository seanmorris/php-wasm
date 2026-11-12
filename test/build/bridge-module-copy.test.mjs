import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import makeEnvironment from '../../bin/make-environment.cjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

// The builder's commands run on the host, with its /src mapped to the fixture.
// The importer has nothing to import here.
const fakeBuilder = directory => `
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2).map(arg => arg.replaceAll('/src/', ${JSON.stringify(`${directory}/`)}));
if(args[0] === 'node' && /import-source\\.mjs$/.test(args[1])) process.exit(0);
const result = spawnSync(args[0], args.slice(1), {stdio: 'inherit'});
process.exit(result.status ?? 1);
`;

for(const name of ['vrzno', 'waitline'])
{
	test(`the ${name} side module is built from sources, not from the static build's outputs`, t => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), `php-${name}-copy-`));

		t.after(() => fs.rmSync(directory, {recursive: true, force: true}));

		const extension = path.join(directory, `third_party/php8.4-src/ext/${name}`);
		const copy = path.join(directory, `third_party/php8.4-${name}`);
		const builder = path.join(directory, 'docker-run.cjs');
		const sources = [
			'config.m4'
			, 'Makefile.frag'
			, `${name}.c`
			, `${name}_js.h.in`
			, `js/${name}_body.js`
			, '.php-wasm-source.json'
		];
		// What compiling the extension into PHP leaves beside those sources.
		const outputs = [
			`${name}.o`
			, `${name}.lo`
			, `${name}.dep`
			, `.libs/${name}.a`
			, `modules/${name}.la`
			, `generated/${name}_js.h`
			, `generated/${name}_js.d`
			, 'generated/npm/node_modules/weakermap/WeakerMap.mjs'
		];

		for(const file of [...sources, ...outputs])
		{
			fs.mkdirSync(path.dirname(path.join(extension, file)), {recursive: true});
			fs.writeFileSync(path.join(extension, file), file);
		}

		fs.writeFileSync(path.join(directory, 'third_party/php8.4-src/.gitignore'), '');
		fs.writeFileSync(builder, fakeBuilder(directory));

		execFileSync('/usr/bin/make', [
			'--no-print-directory'
			, '-f'
			, path.join(root, `packages/${name}/static.mak`)
			, 'PHP_VERSION=8.4'
			, `DOCKER_RUN=${process.execPath} ${builder}`
			, `third_party/php8.4-${name}/config.m4`
		], {
			cwd: directory
			, env: makeEnvironment.independentMakeEnvironment()
			, stdio: 'pipe'
		});

		const copied = fs.readdirSync(copy, {recursive: true})
			.filter(file => fs.statSync(path.join(copy, file)).isFile())
			.map(file => file.split(path.sep).join('/'))
			.sort();

		// A leftover object is newer than its source, so make would link it as it
		// is, and one compiled for a static build has no get_module.
		assert.deepEqual(copied, [...sources].sort());

		// The static build keeps what it compiled.
		for(const file of outputs)
		{
			assert.ok(fs.existsSync(path.join(extension, file)), `${file} was removed from the PHP tree`);
		}
	});
}

const modules = ['packages/vrzno/php8.4-vrzno.so', 'packages/waitline/php8.4-waitline.so'];
const profile = mode => [
	'ENV_FILE=/dev/null'
	, 'MAKE_SHUFFLE='
	, 'BUILD_WORKSPACE='
	, 'PHP_VERSION=8.4'
	, `WITH_VRZNO=${mode}`
	, `WITH_WAITLINE=${mode}`
	, 'WITH_PDO_PGLITE=0'
];

test('bridge-modules names both side modules whichever way the runtimes link them', () => {
	const listed = mode => execFileSync('make', [
		'--no-print-directory'
		, '-f'
		, 'Makefile'
		, '-f'
		, '-'
		, 'print-bridge-modules'
		, ...profile(mode)
	], {
		cwd: root
		, env: makeEnvironment.independentMakeEnvironment()
		, encoding: 'utf8'
		, stdio: ['pipe', 'pipe', 'pipe']
		, input: 'print-bridge-modules:\n\t@printf \'%s|%s\\n\' "$(strip ${BRIDGE_MODULES})" "$(strip ${EXTRA_MODULES})"\n'
	}).trim().split('\n').pop().split('|').map(list => list.split(' ').filter(Boolean));

	// Linked into the runtimes, as in every CI profile: no runtime asks for the
	// modules, but the npm packages ship loaders that name them.
	const [linkedBridge, linkedExtra] = listed('static');

	assert.deepEqual(linkedBridge, modules);
	assert.deepEqual(linkedExtra.filter(file => modules.includes(file)), []);

	// Built as side modules, the runtimes ask for them too.
	const [loadedBridge, loadedExtra] = listed('dynamic');

	assert.deepEqual(loadedBridge, modules);
	assert.deepEqual(loadedExtra.filter(file => modules.includes(file)), modules);

	// A build without the extensions has no module to offer.
	assert.deepEqual(listed('0')[0], []);
});

test('bridge-modules links both side modules in a profile that links the extensions statically', () => {
	const plan = execFileSync('make', ['-n', 'bridge-modules', ...profile('static')], {
		cwd: root
		, env: makeEnvironment.independentMakeEnvironment()
		, encoding: 'utf8'
		, stdio: ['ignore', 'pipe', 'pipe']
		, maxBuffer: 64 * 1024 * 1024
	});

	for(const module of modules)
	{
		assert.ok(plan.includes(`emcc -shared -o /src/${module} `), `${module} is not linked`);
	}
});
