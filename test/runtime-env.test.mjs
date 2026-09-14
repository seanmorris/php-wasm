import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PhpBase } from '../source/PhpBase.mjs';

test('PhpBase exposes selected runtime version through Module ENV', async () => {
	let capturedArgs;

	class FakePHP
{
		constructor(args)
		{
			capturedArgs = args;
			this.FS = {
				analyzePath: () => ({exists: true})
				, writeFile: () => {}
			};
		}

		ccall()
		{
			return 0;
		}
}

	const php = new PhpBase(
		Promise.resolve({default: FakePHP}),
		{version: '8.4', ENV: {APP_ENV: 'test'}}
	);

	await php.binary;

	assert.equal(capturedArgs.ENV.PHP_VERSION, '8.4');
	assert.equal(capturedArgs.ENV.APP_ENV, 'test');
});
