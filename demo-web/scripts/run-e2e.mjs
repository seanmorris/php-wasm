import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pobot } from 'pobot/Pobot.mjs';

const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9414);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWebDir = path.resolve(__dirname, '..');
const testFiles = [
	path.join('test', 'e2e', 'DemoWebE2ETest.mjs')
];

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

const preflightBrowser = async (url) => {
	let pobot;

	try
	{
		pobot = await Pobot.get();
		await pobot.goto(url);

		const page = await pobot.inject(() => ({
			href: window.location.href
			, origin: window.location.origin
			, pathname: window.location.pathname
			, readyState: document.readyState
			, title: document.title
		}));

		if(page?.origin === 'null' || page?.href?.startsWith('chrome-error://'))
		{
			throw new Error(`Browser preflight loaded an invalid page context: ${JSON.stringify(page)}`);
		}
	}
	catch(error)
	{
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Browser preflight failed before cvtest started. `
			+ `This usually means Chromium/DevTools could not start or crashed early. `
			+ `Original error: ${message}`
		);
	}
	finally
	{
		if(pobot)
		{
			try
			{
				await pobot.kill();
			}
			catch
			{}
		}
	}
};

const server = spawn(process.execPath, [path.join('test', 'e2e-server.mjs')], {
	cwd: demoWebDir
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
	await preflightBrowser(`http://127.0.0.1:${port}/php-wasm/home.html?no-service-worker`);
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
