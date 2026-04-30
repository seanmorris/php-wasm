import { spawn } from 'node:child_process';
import http from 'node:http';

const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9414);
const testFiles = [
	'test/e2e/DemoWebE2ETest.mjs'
];

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
	const child = spawn(command, args, {
		cwd: process.cwd()
		, stdio: 'inherit'
		, env: process.env
		, ...options
	});

	child.on('exit', code => {
		if(code === 0)
		{
			resolve();
			return;
		}

		reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
	});
});

const waitForServer = (url, timeout = 60000) => new Promise((resolve, reject) => {
	const start = Date.now();

	const probe = () => {
		const request = http.get(url, response => {
			response.resume();

			if(response.statusCode && response.statusCode < 500)
			{
				resolve();
				return;
			}

			if(Date.now() - start > timeout)
			{
				reject(new Error(`Timed out waiting for ${url}`));
				return;
			}

			setTimeout(probe, 250);
		});

		request.on('error', () => {
			if(Date.now() - start > timeout)
			{
				reject(new Error(`Timed out waiting for ${url}`));
				return;
			}

			setTimeout(probe, 250);
		});
	};

	probe();
});

const server = spawn(process.execPath, ['./test/e2e-server.mjs'], {
	cwd: process.cwd()
	, stdio: 'inherit'
	, env: {...process.env, DEMO_WEB_E2E_PORT: String(port)}
});

const cleanup = () => {
	if(!server.killed)
	{
		server.kill('SIGTERM');
	}
};

process.on('SIGINT', () => {
	cleanup();
	process.exit(130);
});

process.on('SIGTERM', () => {
	cleanup();
	process.exit(143);
});

try
{
	await run('npm', ['run', 'build']);
	await waitForServer(`http://127.0.0.1:${port}/php-wasm/`);
	await run('npx', ['cvtest', ...testFiles], {
		env: {
			...process.env
			, DEMO_WEB_E2E_PORT: String(port)
		}
	});
}
finally
{
	cleanup();
}
