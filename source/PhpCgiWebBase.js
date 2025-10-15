import { PhpCgiBase } from './PhpCgiBase';
import { commitTransaction, startTransaction } from './webTransactions';
import { resolveDependencies } from './resolveDependencies';

const STR = 'string';
const NUM = 'number';

export class PhpCgiWebBase extends PhpCgiBase
{
	startTransaction()
	{
		return startTransaction(this);
	}

	commitTransaction(readOnly = false)
	{
		return commitTransaction(this, readOnly);
	}

	async _beforeRequest()
	{
		if(!this.initialized)
		{
			const php = await this.binary;
			await this.loadInit(php);
			await navigator.locks.request('php-wasm-fs-lock', () => {
				return new Promise((accept,reject) => php.FS.syncfs(true, err => {
					if(err) reject(err);
					else accept();
				}));
			});
		}

		this.initialized = true;
	}

	async _afterRequest()
	{

		if(this.phpArgs.staticFS)
		{
			return;
		}

		const php = await this.binary;

		await navigator.locks.request('php-wasm-fs-lock', () => {
			return new Promise((accept,reject) => php.FS.syncfs(false, err => {
				if(err) reject(err);
				else accept();
			}));
		});
	}

	refresh()
	{
		const {files, libs, urlLibs} = resolveDependencies(this.sharedLibs, this);

		const userLocateFile = this.phpArgs.locateFile || (() => undefined);

		const locateFile = path => {
			let located = userLocateFile(path);
			if(located !== undefined)
			{
				return located;
			}
			if(urlLibs[path])
			{
				return urlLibs[path];
			}
		};

		const phpArgs = {
			persist: [{mountPath:'/persist'}, {mountPath:'/config'}]
			, ...this.phpArgs
			, stdin: () =>  this.input
				? String(this.input.shift()).charCodeAt(0)
				: null
			, stdout: x => this.output.push(x)
			, stderr: x => this.error.push(x)
			, locateFile
		};

		this.binary = navigator.locks.request('php-wasm-fs-lock', async () => {

			const {default: PHP} = await this.binLoader;

			const php = await new PHP(phpArgs);

			await php.ccall(
				'pib_storage_init'
				, NUM
				, []
				, []
				, {async: true}
			);

			if(!php.FS.analyzePath('/preload').exists)
			{
				php.FS.mkdir('/preload');
			}

			await Promise.all(this.files.concat(files).map(
				fileDef => php.FS.createPreloadedFile(fileDef.parent, fileDef.name, fileDef.url, true, false)
			));

			const iniLines = libs.map(lib => {
				if(typeof lib === 'string' || lib instanceof URL)
				{
					return `extension=${lib}`;
				}
				else if(typeof lib === 'object' && lib.ini)
				{
					return `extension=${String(lib.url).split('/').pop()}`;
				}
			});

			this.phpArgs.ini && iniLines.push(this.phpArgs.ini.replace(/\n\s+/g, '\n'));

			php.FS.writeFile('/php.ini', iniLines.join("\n") + "\n", {encoding: 'utf8'});

			await new Promise((accept, reject) => {
				php.FS.syncfs(true, error => {
					if(error) reject(error);
					else accept();
				});
			});

			await php.ccall(
				'wasm_sapi_cgi_init'
				, 'number'
				, []
				, []
				, {async: true}
			);

			const cookieStat = php.FS.analyzePath('/config/.cookies');

			if(cookieStat.exists)
			{
				this.cookieJar.load(php.FS.readFile('/config/.cookies', {encoding: 'utf8'}));
			}

			await this.loadInit(php);

			return php;

		});
	}

	async _enqueue(callback, params = [], readOnly = false)
	{
		let accept, reject;

		const coordinator = new Promise((a,r) => [accept, reject] = [a, r]);

		this.queue.push([callback, params, accept, reject]);

		navigator.locks.request('php-wasm-fs-lock', async () => {

			if(!this.queue.length)
			{
				return;
			}

			await (this.autoTransaction ? this.startTransaction() : Promise.resolve());

			do
			{
				const [callback, params, accept, reject] = this.queue.shift();
				await callback(...params).then(accept).catch(reject);
				let lockChecks = 5;
				while(!this.queue.length && lockChecks--)
				{
					await new Promise(a => setTimeout(a, 5));
				}
			} while(this.queue.length)

			await (this.autoTransaction ? this.commitTransaction(readOnly) : Promise.resolve());
		});

		return coordinator;
	}
}
