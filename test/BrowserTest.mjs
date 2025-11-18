import { BotTest } from 'cv3-test/BotTest.mjs';
import { compareSnapshot } from 'cv3-test/Snapshot.mjs';

const version = process.env.PHP_VERSION ?? '8.4';

export class BrowserTest extends BotTest
{
	startDocument = 'http://localhost:9000/php-wasm/embedded-php.html?no-service-worker';
	parallel = false;
	width = 1024;
	height = 768;

	async testHelloWorld()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=hello-world.php&version=${version}`);
		await new Promise(a => setTimeout(a, 7000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testSqlite()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=sqlite.php&version=${version}`);
		await new Promise(a => setTimeout(a, 7000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testPostgres()
	{
		if(!['8.4', '8.3', '8.2'].includes(version)) return;

		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=postgres.php&version=${version}`);
		await new Promise(a => setTimeout(a, 10000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testSqlitePdo()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=sqlite-pdo.php&version=${version}`);
		await new Promise(a => setTimeout(a, 7000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testFiles()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=files.php&version=${version}`);
		await new Promise(a => setTimeout(a, 10000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testGoto()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=goto.php&version=${version}`);
		await new Promise(a => setTimeout(a, 7000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testDynamicExtensions()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=dynamic-extension.php&version=${version}`);
		await new Promise(a => setTimeout(a, 10000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testCgiWorker()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto(`http://localhost:9000/php-wasm/cgi-bin/test/hello-world.php`);
		await new Promise(a => setTimeout(a, 7000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	// async testFetch()
	// {
	// 	await this.pobot.goto(`http://localhost:9000/php-wasm/embedded-php.html?demo=fetch.php&version=${version}`);
	// 	await new Promise(a => setTimeout(a, 7000));
	// 	const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
	// 	this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
	// 	await new Promise(a => setTimeout(a, 100));
	// }
}
