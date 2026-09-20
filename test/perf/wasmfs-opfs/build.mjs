import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const variant = process.argv[2] ?? 'idbfs';
if(!['idbfs', 'opfs', 'idbfs-pruned'].includes(variant)) throw new Error('Expected idbfs, opfs, or idbfs-pruned');
const {work, assumeOld, phpVersion} = JSON.parse(await fs.readFile(path.join(root, '.cache/wasmfs-opfs/build-inputs.json'), 'utf8'));
const output = path.join(root, '.cache/wasmfs-opfs/artifacts', variant);
await fs.mkdir(path.join(output, 'packages/php-cgi-wasm'), {recursive: true});
await fs.writeFile(path.join(work, 'benchmark-targets.mak'), [
	'include Makefile'
	, '${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs: ${PRE_JS_CACHE}'
	, ''
].join('\n'));

// The only conditional native code is in PIB. Rebuild it when switching the FS;
// all other PHP objects and dependency archives remain identical.
for(const name of ['pib.o', 'pib.lo', '.libs/pib.o'])
{
	await fs.rm(path.join(work, `third_party/php${phpVersion}-src/ext/pib`, name), {force: true});
}
await fs.rm(path.join(output, `packages/php-cgi-wasm/php${phpVersion}-cgi-worker.mjs`), {force: true});
await fs.rm(path.join(work, `third_party/php${phpVersion}-src/sapi/cgi/php${phpVersion}-cgi-worker.mjs.mjs`), {force: true});

const args = [
	'-C', work, '-f', 'benchmark-targets.mak', ...assumeOld
	, '--assume-old=lib/share/icu/72.1/icudt72l.dat'
	, `${output}/packages/php-cgi-wasm/php${phpVersion}-cgi-worker.mjs`
	, `${output}/packages/php-cgi-wasm/php.data`
	, 'ENV_FILE=benchmark.mak', `ENV_DIR=${output}`, `PHP_VERSION=${phpVersion}`
	, `BENCH_WASMFS=${Number(variant === 'opfs')}`, 'EXTRA_MODULES='
];
if(variant === 'idbfs-pruned') args.push('ASYNCIFY_REMOVE=zend_compile*,zend_add_literal*');
console.log(JSON.stringify({variant, command: ['make', ...args], started: new Date().toISOString()}));
const child = spawn('make', args, {
	cwd: root, stdio: 'inherit', env: {...process.env, HOST_PROJECT_ROOT: work}
});
child.on('exit', code => { process.exitCode = code ?? 1; });
