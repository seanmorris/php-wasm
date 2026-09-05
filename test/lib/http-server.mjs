import { once } from 'node:events';
import { createServer } from 'node:http';

// Explicit cleanup also runs on Deno versions without Node's test hooks.
export const withHttpServer = async (handler, callback) => {
	const server = createServer(handler);

	try
	{
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');

		const { port } = server.address();
		return await callback(`http://127.0.0.1:${port}`);
	}
	finally
	{
		if(server.listening)
		{
			await new Promise((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
			});
		}
	}
};
