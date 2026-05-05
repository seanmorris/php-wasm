/**
 * End-to-end runner that builds demo-web, serves the bundle, and launches browser tests.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9414);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWebDir = path.resolve(__dirname, '..');

/**
 * Spawns a child process and rejects when it exits unsuccessfully.
 */
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
	const child = spawn(command, args, {
		cwd: demoWebDir
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

/**
 * Polls the static test server until it starts returning non-5xx responses.
 */
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

const server = spawn(process.execPath, [path.join('test', 'e2e-server.mjs')], {
	cwd: demoWebDir
	, stdio: 'inherit'
	, env: {...process.env, DEMO_WEB_E2E_PORT: String(port)}
});

/**
 * Stops the static test server process if it is still running.
 */
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
	await run('npx', ['playwright', 'test', '-c', 'playwright.config.mjs'], {
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
