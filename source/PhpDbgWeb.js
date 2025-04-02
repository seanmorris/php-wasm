import { PhpBase } from 'php-wasm/PhpBase';
import PhpBinary from './php-dbg-web';
import { commitTransaction, startTransaction } from './webTransactions';

const NUM = 'number';
const STR = 'string';

export class PhpDbgWeb extends PhpBase
{
	constructor(args = {})
	{
		super(PhpBinary, args, 'phpdbg');
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
		return this._enqueue(() => this._main(), []);
	}

	async _main()
	{
		this.inputString('\n');

		const php = (await this.binary);

		const valueA = 'phpdbg';
		const lenA = php.lengthBytesUTF8(valueA) + 1;
		const locA = php._malloc(lenA);
		php.stringToUTF8(valueA, locA, lenA);

		const valueB = '-be';
		const lenB = php.lengthBytesUTF8(valueB) + 1;
		const locB = php._malloc(lenB);
		php.stringToUTF8(valueB, locB, lenB);

		const lloc = php._malloc(4 * 2);

		php.setValue(lloc + 0, locA, '*');
		php.setValue(lloc + 4, locB, '*');

		const call = php.ccall(
			'main_init'
			, NUM
			, [NUM, NUM]
			, [2, lloc]
			, {async: true}
		);

		return call.finally(() => {
			this.flush();
			php._free(lloc);
			php._free(locA);
		});
	}

	async tick(input)
	{
		const php = (await this.binary);

		const valueA = input;

		// this.inputString(valueA);

		const lenA = php.lengthBytesUTF8(valueA) + 1;
		const locA = php._malloc(lenA);
		php.stringToUTF8(valueA, locA, lenA);

		const call = php.ccall(
			'phpdbg_main'
			, NUM
			, [NUM]
			, [locA]
			, {async: true}
		);

		return call
		.catch(error => {
			console.log(error);
		}).finally(() => {
			this.flush();
			php._free(locA);

		});
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
