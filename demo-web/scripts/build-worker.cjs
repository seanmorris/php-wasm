/**
 * Convenience wrapper that invokes the dedicated worker Vite build config.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const vitePackage = require.resolve('vite/package.json');
const viteCli = path.resolve(path.dirname(vitePackage), 'bin', 'vite.js');
const args = [viteCli, 'build', '--config', 'vite.worker.config.mjs', ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, {
	cwd: rootDir
	, stdio: 'inherit'
});

if(result.status !== 0)
{
	process.exit(result.status ?? 1);
}
