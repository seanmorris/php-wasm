import { PhpBase } from 'php-wasm/PhpBase';
import { commitTransaction, startTransaction } from './webTransactions';

const NUM = 'number';
const STR = 'string';

const defaultVersion = '8.3';

export class PhpCliWeb extends PhpBase
{
	constructor(args = {})
	{
		super(import(`./php${args.version ?? defaultVersion}-cli-web.mjs`), args, 'cli');

		this.binary = this.binary.then((php) => {
			console.log(php);
			php.inputDataQueue = [];
			php.awaitingInput = null;
			php.triggerStdin = () => this.dispatchEvent(new CustomEvent('stdin-request'))
			this.addEventListener('stdin-request', async () => this.flush());
			return php;
		});
	}

	startTransaction()
	{
		return startTransaction(this);
	}

	commitTransaction(readOnly = false)
	{
		return commitTransaction(this, readOnly);
	}

	run()
	{
		return this._main();
	}

	async provideInput(line)
	{
		const php = await this.binary;
		await this.startTransaction();

		php.inputDataQueue.push(line + '\n');

		if(php.awaitingInput)
		{
			php.awaitingInput( php.inputDataQueue.shift() );
			php.awaitingInput = null;
		}
	}

	async _main()
	{
		const php = (await this.binary);

		// const cmd = ['php', '-r', 'phpinfo();'];
		const cmd = ['php', '-a'];

		const ptrs = cmd.map(part => {
			const len = php.lengthBytesUTF8(part) + 1;
			const loc = php._malloc(len);
			php.stringToUTF8(part, loc, len);
			return loc;
		});

		const arLoc = php._malloc(4 * ptrs.length);

		for(const i in ptrs)
		{
			php.setValue(arLoc + 4 * i, ptrs[i], '*');
		}

		console.log(arLoc, ptrs);

		try
		{
			const process = php.ccall(
				'main'
				, NUM
				, [NUM, NUM]
				, [ptrs.length, arLoc]
				, {async: true}
			);

			return process;
		}
		catch(error)
		{
			if(!('status' in error ) || error.status !== 0)
			{
				throw error;
			}
		}
		finally
		{
			this.flush();
			ptrs.forEach(p => php._free(p));
			php._free(arLoc);
		}
	}

	async refresh()
	{
		// super.refresh();
		// const php = await this.binary;
		// await navigator.locks.request('php-wasm-fs-lock', () => {
		// 	return new Promise((accept, reject) => {
		// 		php.FS.syncfs(true, error => {
		// 			if(error) reject(error);
		// 			else accept();
		// 		});
		// 	});
		// });
	}

	async _enqueue(callback, params = [], readOnly = false)
	{
		await this.binary;

		let accept, reject;

		const coordinator = new Promise((a,r) => [accept, reject] = [a, r]);

		const _accept = result => accept(result);
		const _reject = reason => reject(reason);

		this.queue.push([callback, params, _accept, _reject]);

		navigator.locks.request('php-wasm-fs-lock', async () => {
			if(!this.queue.length)
			{
				return;
			}

			await ((this.autoTransaction && !readOnly) ? this.startTransaction() : Promise.resolve());

			do
			{
				const [callback, params, accept, reject] = this.queue.shift();
				const run = callback(...params);
				run.then(accept).catch(reject);
				await run;
			} while(this.queue.length)

			await (this.autoTransaction ? this.commitTransaction(readOnly) : Promise.resolve());
		});

		return coordinator;
	}
}
