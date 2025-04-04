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

		this.running = false;
		this.paused = false;
		this.currentFilePtr = null;
		this.currentLinePtr = null;
		this.startingTransaction = null;

		this.binary = this.binary.then((php) => {
			console.log(php);
			php.inputDataQueue = [];
			php.awaitingInput = null;
			php.triggerStdin = () => this.dispatchEvent(new CustomEvent('stdin-request'))
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
		// return this._enqueue(() => this._main(), []);
	}

	async provideInput(line)
	{
		const php = await this.binary;
		await this.startTransaction();

		php.inputDataQueue.push(line + '\n');

		console.log(1, php.inputDataQueue);

		if(php.awaitingInput)
		{
			console.log(2, php.inputDataQueue);

			php.awaitingInput( php.inputDataQueue.shift() );
			php.awaitingInput = null;
		}

		this.addEventListener('stdin-request', async () => {
			this.flush();
		}, {once: true});

	}

	async _main()
	{
		const php = (await this.binary);

		const cmd = ['phpdbg', '-e'];

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

		try
		{
			const process = php.ccall(
				'main'
				, NUM
				, [NUM, NUM]
				, [ptrs.length, arLoc]
				, {async: true}
			);

			this.currentFilePtr = php.ccall(
				'phpdbg_wasm_get_current_file'
				, NUM
				, []
				, []
				, {}
			);

			this.currentLinePtr = php.ccall(
				'phpdbg_wasm_get_current_line'
				, NUM
				, []
				, []
				, {}
			);

			return process;
		}
		finally
		{
			this.flush();
			// ptrs.forEach(p => php._free(p));
			// php._free(arLoc);
		}
	}

	async getPrompt()
	{
		const php = await this.binary;

		return php.ccall(
			'phpdbg_get_prompt'
			, STR
			, []
			, []
			, {}
		);;
	}

	async currentFile()
	{
		const php = await this.binary;

		return php.UTF8ToString(php.getValue(this.currentFilePtr, '*'));
	}

	async currentLine()
	{
		const php = await this.binary;

		return php.getValue(this.currentLinePtr, 'i32');
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
