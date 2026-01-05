import { Test } from 'cv3-test/Test.mjs'
import { compareSnapshot } from 'cv3-test/Snapshot.mjs';

const version = process.env.PHP_VERSION ?? '8.4';

export class NodeCgiTest extends Test
{
	async testHelloWorld()
	{
		const url = 'http://localhost:9001/php-wasm/cgi-bin/test/hello-world.php';
		const phpOutput = await (await fetch(url)).text();
		this.assert(compareSnapshot(phpOutput), 'Snapshot does not match!');
	}

	async testVersion()
	{
		const url = 'http://localhost:9001/php-wasm/cgi-bin/test/version.php';
		const phpOutput = await (await fetch(url)).text();

		this.assert(phpOutput === version, 'Version should be ' + version);
	}
}
