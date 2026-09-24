import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {snapshot} from '../../../bin/prepare-build-workspace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const work = path.join(root, '.cache/wasmfs-opfs/build');
const version = process.env.BENCH_PHP_VERSION ?? '8.3';
if(!/^8\.[0-5]$/.test(version)) throw new Error('Unsupported PHP version');

await snapshot(work, root);
await fs.mkdir(path.join(work, 'third_party'), {recursive: true});
await fs.cp(path.join(root, `third_party/php${version}-src`), path.join(work, `third_party/php${version}-src`), {
	recursive: true, preserveTimestamps: true, verbatimSymlinks: true
	, filter: source => !source.split(path.sep).includes('.git')
});
await fs.cp(path.join(root, 'lib'), path.join(work, 'lib'), {recursive: true, preserveTimestamps: true, verbatimSymlinks: true});

const cSource = path.join(work, 'source/pib/pib.c');
let source = await fs.readFile(cSource, 'utf8');
source = source.replace('void *EMSCRIPTEN_KEEPALIVE __attribute__((noinline)) pib_storage_init(void)\n{',
	'void *EMSCRIPTEN_KEEPALIVE __attribute__((noinline)) pib_storage_init(void)\n{\n#if BENCH_WASMFS\n\treturn NULL;\n#else');
source = source.replace('\n\treturn NULL;\n}\n\n/**\n * Clear PHP', '\n\treturn NULL;\n#endif\n}\n\n/**\n * Clear PHP');
source += '\n#include "benchmark-fs.h"\n';
await fs.writeFile(cSource, source);
await fs.copyFile(path.join(here, 'benchmark-fs.h'), path.join(work, 'source/pib/benchmark-fs.h'));

let profile = await fs.readFile(path.join(root, `.github/.env_${version}.static.ci`), 'utf8');
profile += `
# Fixed settings for both filesystem variants.
WITH_SDL=0
WITH_WAITLINE=0
WITH_PDO_PGLITE=1
WITH_VRZNO=1
CPU_COUNT=8
MAX_LOAD=12
MAKE_SHUFFLE=
ASYNCIFY_REMOVE=
EXTRA_FLAGS+=-sASYNCIFY_STACK_SIZE=131072
EXTRA_MODULES=
BENCH_WASMFS?=0
EXTRA_CFLAGS+=-DBENCH_WASMFS=\${BENCH_WASMFS}
ifeq (\${BENCH_WASMFS},1)
WORKER_FS_TYPE=-sWASMFS=1
endif
`;
await fs.writeFile(path.join(work, 'benchmark.mak'), profile);
// Restored archives are fixed inputs shared by both variants. Avoid triggering
// their download/build rules just to reconstruct missing source checkout stamps.
const archiveInputs = (await fs.readdir(path.join(work, 'lib/lib'))).filter(name => name.endsWith('.a'));
const assumeOld = archiveInputs.map(name => `--assume-old=lib/lib/${name}`);
const archives = [];
for(const name of archiveInputs)
{
	const bytes = await fs.readFile(path.join(work, 'lib/lib', name));
	archives.push({name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}
const metadata = {
	work, assumeOld, archives, phpVersion: version, profile
	, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
	, builderImage: execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', 'seanmorris/php-emscripten-builder'], {encoding: 'utf8'}).trim()
};
await fs.writeFile(path.join(root, '.cache/wasmfs-opfs/build-inputs.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(work);
