import { strict as assert } from 'node:assert';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { test } from 'node:test';
import { withHttpServer } from './lib/http-server.mjs';

const respond = (_request, response) => response.end('fixture response');

const assertClosed = async origin => {
	const { hostname, port } = new URL(origin);

	await assert.rejects(async () => {
		const socket = createConnection({host: hostname, port: Number(port)});

		try
		{
			await once(socket, 'connect');
		}
		finally
		{
			socket.destroy();
		}
	}, {code: 'ECONNREFUSED'});
};

test('HTTP fixture closes its listener after a successful callback', async () => {
	let origin;
	const result = await withHttpServer(respond, async serverOrigin => {
		origin = serverOrigin;
		const response = await fetch(origin);
		assert.equal(await response.text(), 'fixture response');
		return 'callback result';
	});

	assert.equal(result, 'callback result');
	await assertClosed(origin);
});

test('HTTP fixture closes its listener when initialization or assertions throw', async () => {
	for(const requestFirst of [false, true])
	{
		let origin;
		const failure = new Error('fixture callback failed');

		await assert.rejects(withHttpServer(respond, async serverOrigin => {
			origin = serverOrigin;

			if(requestFirst)
			{
				const response = await fetch(origin);
				await response.text();
			}

			throw failure;
		}), error => error === failure);

		await assertClosed(origin);
	}
});

test('HTTP fixtures keep overlapping servers and cleanup independent', async () => {
	let outerOrigin;
	let innerOrigin;

	await withHttpServer((_request, response) => response.end('outer'), async outer => {
		outerOrigin = outer;

		await withHttpServer((_request, response) => response.end('inner'), async inner => {
			innerOrigin = inner;
			assert.notEqual(outer, inner);
			const responses = await Promise.all([fetch(outer), fetch(inner)]);
			assert.deepEqual(await Promise.all(responses.map(response => response.text())), ['outer', 'inner']);
		});

		await assertClosed(innerOrigin);
		const response = await fetch(outer);
		assert.equal(await response.text(), 'outer');
	});

	await assertClosed(outerOrigin);
});
