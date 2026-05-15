/**
 * Shared php-dbg runtime argument factory used by the VS Code integration.
 */
import { PGlite } from '@electric-sql/pglite';
import { buildType } from './runtimePaths';
import { sharedSupportLibs } from 'demo-web-shared-support-libs';

const sharedLibs = [];

if(buildType === 'dynamic')
{
	sharedLibs.push(...(await Promise.all([
		import('php-wasm-libxml')
		, import('php-wasm-dom')
		, import('php-wasm-zlib')
		, import('php-wasm-libzip')
		, import('php-wasm-gd')
		, import('php-wasm-iconv')
		, import('php-wasm-intl')
		, import('php-wasm-openssl')
		, import('php-wasm-mbstring')
		, import('php-wasm-sqlite')
		, import('php-wasm-xml')
		, import('php-wasm-simplexml')
		, import('php-wasm-yaml')
	])).map(module => module.default));
}
else if(buildType === 'shared')
{
	sharedLibs.push(...sharedSupportLibs);
}
/**
 * Creates the runtime configuration passed to php-dbg-wasm instances.
 */
export const createPhpDbgRuntimeArgs = (version = '8.3', program = null) => ({
	version
	, ...(program ? {program} : {})
	, sharedLibs
	, ini: `
		date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
		expose_php=0
	`
	, PGlite
	, persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
});
