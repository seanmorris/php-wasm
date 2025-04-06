import { BotTest } from 'cv3-test/BotTest.mjs';
import { compareSnapshot } from 'cv3-test/Snapshot.mjs';

export class BrowserTest extends BotTest
{
	startDocument = 'http://localhost:9000/embedded-php.html?no-service-worker';
	parallel = false;
	width = 1024;
	height = 768;

	async testHelloWorld()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=hello-world.php')
		await new Promise(a => setTimeout(a, 5000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testSqlite()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=sqlite.php')
		await new Promise(a => setTimeout(a, 5000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testPostgres()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=postgres.php')
		await new Promise(a => setTimeout(a, 5000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testSqlitePdo()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=sqlite-pdo.php')
		await new Promise(a => setTimeout(a, 5000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testFiles()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=files.php')
		await new Promise(a => setTimeout(a, 10000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testGoto()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=goto.php')
		await new Promise(a => setTimeout(a, 5000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	async testDynamicExtensions()
	{
		await new Promise(a => setTimeout(a, 1000));
		await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=dynamic-extension.php')
		await new Promise(a => setTimeout(a, 10000));
		const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
		await new Promise(a => setTimeout(a, 100));
	}

	// async testFetch()
	// {
	// 	await this.pobot.goto('http://localhost:9000/embedded-php.html?demo=fetch.php')
	// 	await new Promise(a => setTimeout(a, 5000));
	// 	const phpOutput = await this.pobot.inject(() => document.querySelectorAll('iframe')[1].getAttribute('srcdoc'));
	// 	this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
	// 	await new Promise(a => setTimeout(a, 100));
	// }
}
