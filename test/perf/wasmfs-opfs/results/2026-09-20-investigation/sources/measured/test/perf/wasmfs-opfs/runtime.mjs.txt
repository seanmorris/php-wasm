import {PhpCgiBase} from './staged/PhpCgiBase.mjs';

/**
 * Uses the same async native FS bridge for both binaries. This leaves the
 * runtime's internal synchronous FS object intact and makes every OPFS call
 * enter Wasm through an Asyncify-aware ccall.
 * @param {object} php Instantiated runtime.
 * @returns {object} Minimal filesystem interface used by CGI routing.
 */
function filesystem(php)
{
	const call = (name, types, args) => php.ccall(name, 'number', types, args, {async: true});
	return {
		async analyzePath(path) {
			const mode = await call('benchmark_stat', ['string'], [path]);
			return {exists: mode >= 0, object: {mode, isFolder: (mode & 0o170000) === 0o040000}};
		}
		, isFile: mode => (mode & 0o170000) === 0o100000
		, isDir: mode => (mode & 0o170000) === 0o040000
		, async mkdir(path) {
			const result = await call('benchmark_mkdir', ['string'], [path]);
			if(result < 0) throw new Error(`mkdir ${path}: errno ${-result}`);
		}
		, async writeFile(path, content) {
			const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
			const pointer = php._malloc(bytes.length || 1);
			try
			{
				php.HEAPU8.set(bytes, pointer);
				const result = await call('benchmark_write', ['string', 'number', 'number'], [path, pointer, bytes.length]);
				if(result !== bytes.length) throw new Error(`write ${path}: result ${result}`);
			}
			finally
			{ php._free(pointer); }
		}
		, async readFile(path, {encoding} = {}) {
			const pointer = await call('benchmark_read', ['string'], [path]);
			if(!pointer) throw new Error(`read ${path} failed`);
			try
			{
				const length = php._benchmark_read_length();
				const bytes = php.HEAPU8.slice(pointer, pointer + length);
				return encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
			}
			finally
			{ php._free(pointer); }
		}
	};
}

/** CGI benchmark adapter; production wrappers and defaults are left untouched. */
export class BenchmarkCgi extends PhpCgiBase
{
	/**
	 * Starts the selected binary and records native startup and hydration separately.
	 * @returns {Promise<object>} Ready PHP module.
	 */
	refresh()
	{
		this.initialized = false;
		this.startup = {};
		this.binary = (async () => {
			const started = performance.now();
			const {default: factory} = await this.binLoader;
			const php = await factory({
				persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
				, stdin: () => this.input?.length ? this.input.shift().charCodeAt(0) : null
				, stdout: byte => this.output.push(byte)
				, stderr: byte => this.error.push(byte)
				, locateFile: file => new URL(`./artifacts/${this.phpArgs.backend}/packages/php-cgi-wasm/${file.split('/').pop()}`, import.meta.url).href
			});
			this.startup.instantiateMs = performance.now() - started;
			php.benchmarkFS = filesystem(php);
			const mounted = performance.now();
			await php.ccall('pib_storage_init', 'number', [], [], {async: true});
			if(this.phpArgs.backend === 'opfs')
			{
				// WasmFS defaults to line-oriented console output. CGI needs the
				// original bytes, including CRLF headers and binary response bodies.
				const devices = [
					{fd: 0, name: 'benchmark-stdin', input: () => this.input?.length ? this.input.shift().charCodeAt(0) : null}
					, {fd: 1, name: 'benchmark-stdout', output: byte => this.output.push(byte & 255)}
					, {fd: 2, name: 'benchmark-stderr', output: byte => this.error.push(byte & 255)}
				];
				for(const device of devices)
				{
					php.FS.createDevice('/dev', device.name, device.input, device.output);
					const fd = php.ccall('open', 'number', ['string', 'number', 'number'], [`/dev/${device.name}`, device.fd ? 1 : 0, 0]);
					if(fd < 0) throw new Error(`Cannot open CGI device: ${device.name}`);
					php.ccall('close', 'number', ['number'], [device.fd]);
					const result = php.ccall('dup', 'number', ['number'], [fd]);
					php.ccall('close', 'number', ['number'], [fd]);
					if(result !== device.fd) throw new Error(`Cannot redirect CGI descriptor: ${device.fd}`);
				}
				const result = await php.ccall('benchmark_mount', 'number', [], [], {async: true});
				if(result) throw new Error(`OPFS mount failed: ${result}`);
			}
			else await this.sync(php, true);
			this.startup.mountHydrateMs = performance.now() - mounted;
			await php.benchmarkFS.mkdir('/preload');
			await php.benchmarkFS.writeFile('/php.ini', [
				'memory_limit=512M', 'max_execution_time=0', 'display_errors=1'
				, 'log_errors=1', 'error_log=/dev/stderr', 'session.save_path=/tmp'
			].join('\n') + '\n');
			await php.ccall('wasm_sapi_cgi_init', 'number', [], [], {async: true});
			if((await php.benchmarkFS.analyzePath('/config/.cookies')).exists)
			{
				this.cookieJar.load(await php.benchmarkFS.readFile('/config/.cookies', {encoding: 'utf8'}));
			}
			this.startup.totalMs = performance.now() - started;
			return php;
		})();
		return this.binary;
	}

	/**
	 * Mirrors the IndexedDB wrapper's initial request hydration.
	 * @param {object} php Captured runtime.
	 * @returns {Promise<void>} Ready for the request.
	 */
	async _beforeRequest(php)
	{
		if(!this.initialized && this.phpArgs.backend === 'idbfs') await this.sync(php, true);
		this.initialized = true;
	}

	/**
	 * Includes durable completion in the request timing.
	 * @param {object} php Captured runtime.
	 * @returns {Promise<void>} Persistent changes completed.
	 */
	async _afterRequest(php)
	{
		const started = performance.now();
		if(this.phpArgs.backend === 'idbfs') await this.sync(php, false);
		this.lastFlushMs = performance.now() - started;
	}

	/**
	 * Hydrates or flushes the legacy persistence backend.
	 * @param {object} php Runtime with the original FS object.
	 * @param {boolean} populate Read the stored filesystem when true.
	 * @returns {Promise<void>} Completed synchronization.
	 */
	sync(php, populate)
	{
		return new Promise((resolve, reject) => php.FS.syncfs(populate, error => error ? reject(error) : resolve()));
	}
}
