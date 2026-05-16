const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');

const { PhpCgiNode } = require('php-cgi-wasm/PhpCgiNode');
const { nodeRuntimeOptions } = require('../lib/node-runtime-options.cjs');

(async () => {
	const port = Number(process.env.CGI_NODE_TEST_PORT ?? 3003);
	const version = process.env.PHP_VERSION ?? '8.4';
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'php-cgi-node-test-'));
	const persistRoot = path.join(tempRoot, 'persist');
	const configRoot = path.join(tempRoot, 'config');
	const wwwRoot = path.join(persistRoot, 'www', 'test');

	await mkdir(wwwRoot, { recursive: true });
	await mkdir(configRoot, { recursive: true });
	await writeFile(path.join(wwwRoot, 'hello-world.php'), '<?php echo "Hello, world!\\n";');
	await writeFile(path.join(wwwRoot, 'version.php'), '<?php echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;');

	const php = new PhpCgiNode(nodeRuntimeOptions({
		version,
		runtime: 'cgi',
		prefix: '/php-wasm/cgi-bin/',
		docroot: '/persist/www',
		persist: [
			{ mountPath: '/persist', localPath: persistRoot },
			{ mountPath: '/config', localPath: configRoot },
		],
	}));

	await php.binary;

	const server = http.createServer(async (request, response) => {
		const result = await php.request(request);
		const reader = result.body.getReader();

		response.writeHead(result.status, [...result.headers.entries()].flat());

		let done = false;

		while(!done)
		{
			const chunk = await reader.read();
			done = chunk.done;

			if(chunk.value)
			{
				response.write(chunk.value);
			}
		}

		response.end();
	});

	const closeServer = async () => {
		await new Promise(resolve => server.close(() => resolve()));
		await rm(tempRoot, { recursive: true, force: true });
	};

	for(const signal of ['SIGINT', 'SIGTERM'])
	{
		process.once(signal, async () => {
			await closeServer();
			process.exit(0);
		});
	}

	server.listen(port, '0.0.0.0');
})().catch(error => {
	console.error(error);
	process.exit(1);
});
