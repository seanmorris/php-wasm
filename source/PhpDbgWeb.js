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
		this.currentFile = null;
		this.currentLine = null;
		this.inputPtr = null;
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
			return php.ccall(
				'main_init'
				, NUM
				, [NUM, NUM]
				, [ptrs.length, arLoc]
				, {async: true}
			);
		}
		finally
		{
			this.flush();
			// ptrs.forEach(p => php._free(p));
			// php._free(arLoc);
		}
	}

	async tick(input)
	{
		const php = (await this.binary);

		const runFlagPtr = php.ccall(
			'phpdbg_wasm_get_running_flag_pointer'
			, NUM
			, []
			, []
			, {}
		);

		const pauseFlagPtr = php.ccall(
			'phpdbg_wasm_get_paused_flag_pointer'
			, NUM
			, []
			, []
			, {}
		);

		const currentFilePtr = php.ccall(
			'phpdbg_wasm_get_current_file'
			, NUM
			, []
			, []
			, {}
		);

		const currentLinePtr = php.ccall(
			'phpdbg_wasm_get_current_line'
			, NUM
			, []
			, []
			, {}
		);

		try
		{
			const len = php.lengthBytesUTF8(input) + 1;
			const loc = php._malloc(len);
			php.stringToUTF8(input, loc, len);

			this.inputPtr = loc;
			const call = php.ccall(
				'phpdbg_main'
				, NUM
				, [NUM]
				, [this.inputPtr]
				, {async: true}
			);

			await call;

			this.running = php.getValue(runFlagPtr, 'i8');
			this.paused = php.getValue(pauseFlagPtr, 'i8');

			this.currentFile = php.UTF8ToString(php.getValue(currentFilePtr, '*'));
			this.currentLine = php.getValue(currentLinePtr, 'i32');

			if(this.paused)
			{
				php.setValue(pauseFlagPtr, 0, 'i8');
			}

			return call;
		}
		finally
		{
			if(!this.running)
			{
				this.currentFile = null;
				this.currentLine = null;
			}

			await this.flush();
			php._free(this.inputPtr);

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
