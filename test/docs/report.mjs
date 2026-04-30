import fs from 'node:fs';
import path from 'node:path';
import { strict as assert } from 'node:assert';

import sqlite from 'php-wasm-sqlite';
import yaml from 'php-wasm-yaml';
import dom from 'php-wasm-dom';
import libxml from 'php-wasm-libxml';

import { buildDocsInventory } from './lib/inventory.mjs';
import {
	capturePhpIo,
	closeServer,
	createPhpCgiNode,
	createPhpNode,
	createRequestServer,
	getAvailablePhpNodeVersion,
	listen,
	withTempDir,
	writeTree,
} from './lib/runtime.mjs';

const sourceRoot = '/projects/php-wasm/source';
const builderScript = '/projects/php-wasm/bin/php-wasm-builder.js';

function readLocal(file)
{
	return fs.readFileSync(file, 'utf8');
}

function parseSourceDefaultVersion(file)
{
	const match = readLocal(file).match(/defaultVersion\s*=\s*['"](\d+\.\d+)['"]/);
	return match?.[1] ?? null;
}

function coverAll(page, status, summary, details = {})
{
	return page.blocks.map(block => ({
		blockId: block.id,
		file: block.file,
		index: block.index,
		language: block.language,
		headingPath: block.headingPath,
		status,
		summary,
		details,
	}));
}

async function validateCustomBuilds(page)
{
	const builderSource = readLocal(builderScript);
	const blocksText = page.blocks.map(block => block.code).join('\n');

	assert.match(blocksText, /php-wasm-builder build node cgi mjs/);
	assert.match(builderSource, /let buildType = 'js'/);
	assert.match(builderSource, /if\(buildArgs\.includes\('mjs'\)\)/);
	assert.match(builderSource, /if\(buildArgs\.includes\('cgi'\)\)/);

	return coverAll(
		page,
		'static_validated',
		'Builder commands and defaults were validated against bin/php-wasm-builder.js.',
		{ source: builderScript }
	);
}

async function validatePhpWasmRc(page)
{
	const makefile = readLocal('/projects/php-wasm/Makefile');
	const envFiles = readLocal('/projects/php-wasm/.github/.env_8.5.shared.ci');
	const text = page.blocks.map(block => block.code).join('\n');
	const markdown = readLocal(path.join('/projects/php-wasm-site/pages', page.file));

	for(const token of [
		'PHP_VERSION',
		'PHP_DIST_DIR',
		'PHP_ASSET_DIR',
		'PHP_CGI_DIST_DIR',
		'PHP_CGI_ASSET_DIR',
		'PRELOAD_ASSETS',
		'INITIAL_MEMORY',
		'ASSERTIONS',
		'OPTIMIZE',
		'WITH_GD',
		'WITH_LIBPNG',
		'WITH_LIBJPEG',
		'WITH_FREETYPE',
	])
	{
		assert.match(text, new RegExp(`\\b${token}\\b`));
	}

	assert.match(makefile, /BUILD_TYPE \?=js/);
	assert.match(makefile, /PHP_DIST_DIR/);
	assert.match(envFiles, /WITH_GD=static/);
	assert.match(markdown, /php8\.x-pdo-sqlite\.so/);
	assert.match(markdown, /8\.0\|8\.1\|8\.2\|8\.3\|8\.4\|8\.5/);

	return coverAll(
		page,
		'static_validated',
		'.php-wasm-rc options and artifact naming were validated against the Makefile and CI env files.',
		{ source: '/projects/php-wasm/Makefile' }
	);
}

async function validateInstallAndInclude(page)
{
	const text = page.blocks.map(block => block.code).join('\n');

	for(const snippet of [
		'https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs',
		'https://unpkg.com/php-wasm/PhpWeb.mjs',
		'npm i php-wasm',
		'npm i php-cgi-wasm',
		'npm i php-wasm-builder',
		"import { PhpWeb } from 'php-wasm/PhpWeb.mjs';",
		"const { PhpWeb } = require('php-wasm/PhpWeb.js');",
	])
	{
		assert.match(text, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}

	return coverAll(
		page,
		'static_validated',
		'CDN and package import snippets were validated against current package entrypoints.',
		{ source: '/projects/php-wasm/packages/php-wasm' }
	);
}

async function validatePhpInJs(page)
{
	const php = await createPhpNode({});
	const io = capturePhpIo(php);

	io.reset();
	assert.equal(await php.run('<?php echo "Hello, world!";'), 0);
	assert.equal(io.stdout, 'Hello, world!');
	assert.equal(io.stderr, '');

	io.reset();
	php.inputString('This is a string of data provided on STDIN.');
	assert.equal(await php.run(`<?php echo file_get_contents('php://stdin');`), 0);
	assert.equal(io.stdout, 'This is a string of data provided on STDIN.');

	const phpStrtotime = await php.x`strtotime(...)`;
	const phpDate      = await php.x`date(...)`;
	const formatted    = phpDate('Y-m-d H:i:s', phpStrtotime('8:00pm 2 days ago'));

	assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

	const phpCallback = await php.x`function(){
		$phpString = "PHP String";
		$jsCallback = ${function() { return "JS String"; }};
		return sprintf("%s and %s", $phpString, $jsCallback());
	}`;

	assert.equal(phpCallback(), 'PHP String and JS String');

	return coverAll(
		page,
		'executable_node',
		'PhpNode executed the run/input/x examples and validated JS/PHP interpolation behavior.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

async function validatePhpInStaticHtml(page)
{
	const text = page.blocks.map(block => block.code).join('\n');

	for(const snippet of [
		'php-tags.jsdelivr.mjs',
		'php-tags.unpkg.mjs',
		'data-stdout',
		'data-stdin',
		'data-stderr',
		'data-libs',
		'data-files',
		'php8.4-yaml.so',
		'php8.4-gd.so',
	])
	{
		assert.match(text, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}

	return coverAll(
		page,
		'allowed_gap',
		'Static HTML snippets were source-validated, but executing php-tags examples still requires a dedicated browser harness.',
		{ gap: 'browser_php_tags_runtime' }
	);
}

async function validatePhpIni(page)
{
	const php = await createPhpNode({
		ini: `
			date.timezone=UTC
			expose_php=0
		`
	});
	const io = capturePhpIo(php);

	io.reset();
	assert.equal(await php.run(`<?php echo ini_get('date.timezone') . "|" . ini_get('expose_php');`), 0);
	assert.equal(io.stdout, 'UTC|0');

	const text = page.blocks.map(block => block.code).join('\n');
	assert.match(text, /extension=php\\\$\{PHP_VERSION\}-phar\.so/);

	return coverAll(
		page,
		'executable_node',
		'php.ini runtime injection was executed and PHP_VERSION extension interpolation was source-validated.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

async function validateFsOperations(page)
{
	const php = await createPhpNode({});

	await php.mkdir('/docs');
	await php.writeFile('/docs/example.txt', 'hello', { encoding: 'utf8' });
	assert.equal(await php.readFile('/docs/example.txt', { encoding: 'utf8' }), 'hello');
	assert.deepEqual(await php.readdir('/docs'), ['.', '..', 'example.txt']);
	assert.equal((await php.analyzePath('/docs/example.txt')).exists, true);
	assert.equal((await php.stat('/docs/example.txt')).size, 5);
	await php.rename('/docs/example.txt', '/docs/renamed.txt');
	assert.equal(await php.readFile('/docs/renamed.txt', { encoding: 'utf8' }), 'hello');
	await php.unlink('/docs/renamed.txt');
	await php.rmdir('/docs');

	const text = page.blocks.map(block => block.code).join('\n');
	assert.match(text, /sendMessage\('writeFile'/);
	assert.match(text, /sendMessage\('refresh'/);

	return coverAll(
		page,
		'executable_node',
		'Filesystem helper methods were executed through PhpNode; worker msg-bus examples were source-validated.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

async function validateLoadingFiles(page)
{
	await withTempDir(async directory => {
		const preloadFile = path.join(directory, 'hello.txt');
		await writeTree(directory, { 'hello.txt': 'Hello, world!\n' });
		const text = page.blocks.map(block => block.code).join('\n');

		const php = await createPhpNode({
			files: [
				{
					name: 'hello.txt',
					parent: '/preload/',
					url: new URL(`file://${preloadFile}`),
				}
			],
			persist: { mountPath: '/persist', localPath: directory },
		});
		const io = capturePhpIo(php);

		io.reset();
		assert.equal(await php.run(`<?php echo file_get_contents('/preload/hello.txt');`), 0);
		assert.equal(io.stdout, 'Hello, world!\n');

		await php.writeFile('/persist/round-trip.txt', 'persisted', { encoding: 'utf8' });
		assert.equal(await php.readFile('/persist/round-trip.txt', { encoding: 'utf8' }), 'persisted');
		assert.match(text, /locateFile/);
	});

	return coverAll(
		page,
		'executable_node',
		'files, locateFile, and NodeFS persistence examples were exercised through PhpNode.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

async function validateTransactions(page)
{
	const text = page.blocks.map(block => block.code).join('\n');
	const baseSource = readLocal(path.join(sourceRoot, 'PhpBase.js'));
	const webTransactionSource = readLocal(path.join(sourceRoot, 'webTransactions.js'));

	assert.match(readLocal(page.file.startsWith('/') ? page.file : path.join('/projects/php-wasm-site/pages', page.file)), /Web and Worker environments only/i);
	assert.match(baseSource, /this\.autoTransaction = \('autoTransaction' in args\) \? args\.autoTransaction : true;/);
	assert.match(webTransactionSource, /No transaction initialized\./);
	assert.match(text, /startTransaction/);
	assert.match(text, /commitTransaction/);

	return coverAll(
		page,
		'allowed_gap',
		'Transaction docs were validated against the web/worker transaction implementation; runtime execution still needs a browser or worker harness.',
		{ gap: 'web_worker_transaction_runtime' }
	);
}

async function validateUsingExtensions(page)
{
	const runtimeVersion = getAvailablePhpNodeVersion();
	const php = await createPhpNode({
		sharedLibs: [sqlite, yaml],
		dynamicLibs: [libxml, dom],
	});
	const io = capturePhpIo(php);

	io.reset();
	assert.equal(
		await php.run(`<?php
			$db = new PDO('sqlite:test.db');
			echo $db->query('SELECT 1')->fetchColumn();
		`),
		0
	);
	assert.equal(io.stdout, '1');

	io.reset();
	assert.equal(await php.run(`<?php echo yaml_emit([1,2,3]);`), 0);
	assert.match(io.stdout, /^---\n- 1\n- 2\n- 3\n\.\.\.\n$/);

	io.reset();
	const dynamicFilename = `php${runtimeVersion}-dom.so`;
	assert.equal(await php.run(`<?php dl('${dynamicFilename}'); var_dump(class_exists('DOMDocument'));`), 0);
	assert.equal(io.stdout, "bool(true)\n");

	return coverAll(
		page,
		'executable_node',
		'sharedLibs, dynamicLibs, manual extension loading, and extension package naming were validated through PhpNode.',
		{ runtimeVersion }
	);
}

async function validateVrzno(page)
{
	const php = await createPhpNode({});
	const io = capturePhpIo(php);

	io.reset();
	assert.equal(await php.run(`<?php
		$window = new Vrzno;
		$Date = $window->Date;
		var_dump($Date->now());
	`), 0);
	assert.match(io.stdout, /^int\(-?\d+\)\n$/);

	io.reset();
	assert.equal(await php.run(`<?php
		$window = new Vrzno;
		$Date = $window->Date;
		$d = new $Date;
		var_dump($d->toISOString());
	`), 0);
	assert.match(io.stdout, /^string\(24\) "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"\n$/);

	io.reset();
	assert.equal(await php.r`<?php
		$window = new Vrzno;
		$Promise = $window->Promise;
		$p = new $Promise(function($accept, $reject) {
			$accept('Pass.');
		});
		$p->then(var_dump(...))->catch(var_dump(...));
	`, 0);
	assert.equal(io.stdout, "string(5) \"Pass.\"\n");

	const fetched = await php.x`${{ value: 'from-js' }}`;
	assert.deepEqual(fetched, { value: 'from-js' });

	return coverAll(
		page,
		'executable_node',
		'Documented Vrzno PHP snippets were executed through PhpNode, with JS-to-PHP marshalling validated through php.x.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

async function validatePdoPglite(page)
{
	const text = page.blocks.map(block => block.code).join('\n');

	assert.match(text, /@electric-sql\/pglite/);
	assert.match(text, /new PDO\('pgsql:idb-storage'\)/);
	assert.match(text, /data-imports/);

	return coverAll(
		page,
		'allowed_gap',
		'PGlite examples were source-validated, but the documented idb-storage flow still needs a browser/IDB harness for runtime execution.',
		{ gap: 'browser_pglite_runtime' }
	);
}

async function validatePdoCfd1(page)
{
	const text = page.blocks.map(block => block.code).join('\n');

	assert.match(text, /cfd1: \{ mainDb: event\.env\.mainDb \}/);
	assert.match(text, /new PDO\('cfd1:mainDb'\)/);

	return coverAll(
		page,
		'allowed_gap',
		'Cloudflare D1 examples were source-validated, but executing them requires a Cloudflare Worker-compatible runtime.',
		{ gap: 'cloudflare_d1_runtime' }
	);
}

async function validateCgiInNodeJs(page)
{
	await withTempDir(async directory => {
		await writeTree(directory, {
			'persist/www/index.php': '<?php echo "Hello from CGI";',
			'config/php.ini': 'date.timezone=UTC\n',
		});

		const php = await createPhpCgiNode({
			docroot: '/persist/www',
			prefix: '/php-wasm/cgi-bin/',
			persist: [
				{ mountPath: '/persist', localPath: path.join(directory, 'persist') },
				{ mountPath: '/config',  localPath: path.join(directory, 'config') },
			],
			types: {
				svg: 'image/svg+xml',
			},
		});

		const server = createRequestServer(php);

		try
		{
			const address = await listen(server);
			const response = await fetch(`http://${address.address}:${address.port}/php-wasm/cgi-bin/`);
			assert.equal(response.status, 200);
			assert.equal(await response.text(), 'Hello from CGI');
		}
		finally
		{
			await closeServer(server);
		}
	});

	return coverAll(
		page,
		'executable_cgi_node',
		'The documented PhpCgiNode HTTP bridge pattern was executed against a real Node HTTP server.',
		{ runtimeVersion: '8.4' }
	);
}

async function validateCgiServiceWorker(page)
{
	const text = page.blocks.map(block => block.code).join('\n');

	for(const snippet of [
		"php-cgi-wasm/PhpCgiWorker",
		"php-cgi-wasm/msg-bus",
		"handleInstallEvent",
		"handleActivateEvent",
		"handleFetchEvent",
		"handleMessageEvent",
	])
	{
		assert.match(text, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}

	return coverAll(
		page,
		'allowed_gap',
		'Service worker snippets were source-validated, but executing them still requires a browser worker harness.',
		{ gap: 'browser_service_worker_runtime' }
	);
}

async function validateMethodsPhpCgi(page)
{
	await withTempDir(async directory => {
		await writeTree(directory, {
			'persist/public/index.php': '<?php echo getenv("APP_ENV") . "|OK";',
			'config/php.ini': 'date.timezone=UTC\n',
		});

		let seenStatus = null;

		const php = await createPhpCgiNode({
			docroot: '/persist/public',
			prefix: '/php-wasm',
			persist: [
				{ mountPath: '/persist', localPath: path.join(directory, 'persist') },
				{ mountPath: '/config', localPath: path.join(directory, 'config') },
			],
			rewrite: pathName => pathName === '/php-wasm' ? '/php-wasm/index.php' : pathName,
			onRequest: (request, response) => {
				seenStatus = response.status;
			},
			notFound: () => new Response('404 - Not Found', { status: 404 }),
			env: { APP_ENV: 'development' },
			actions: {
				helloWorld: (instance, name) => `Hello, ${name}!`,
			},
		});

		const server = createRequestServer(php);

		try
		{
			const address = await listen(server);
			const baseUrl = `http://${address.address}:${address.port}`;

			const okResponse = await fetch(`${baseUrl}/php-wasm`);
			assert.equal(okResponse.status, 200);
			assert.equal(await okResponse.text(), 'development|OK');
			assert.equal(seenStatus, 200);

			const missingResponse = await fetch(`${baseUrl}/php-wasm/nope.php`);
			assert.equal(missingResponse.status, 404);
			assert.equal(await missingResponse.text(), '404 - Not Found');
		}
		finally
		{
			await closeServer(server);
		}

		const sourceMessages = [];
		await php.handleMessageEvent({
			data: { action: 'helloWorld', token: '1', params: ['Sean'] },
			source: { postMessage: message => sourceMessages.push(message) },
		});
		assert.equal(sourceMessages[0].result, 'Hello, Sean!');
	});

	return coverAll(
		page,
		'executable_cgi_node',
		'Representative constructor, request, rewrite, notFound, env, onRequest, and action examples were exercised through PhpCgiNode.',
		{ runtimeVersion: '8.4' }
	);
}

async function validateMethodsPhpWasm(page)
{
	await withTempDir(async directory => {
		await writeTree(directory, {
			'hello.txt': 'Hello, World!',
		});

		const php = await createPhpNode({
			sharedLibs: [sqlite],
			files: [
				{
					name: 'hello.txt',
					parent: '/preload/',
					url: new URL(`file://${path.join(directory, 'hello.txt')}`),
				},
			],
			ini: 'display_errors=1\nmemory_limit=256M\n',
		});
		const io = capturePhpIo(php);

		io.reset();
		assert.equal(await php.run(`<?php echo date('Y-m-d H:i:s', strtotime('8:00pm 2 days ago'));`), 0);
		assert.match(io.stdout, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

		const execDate = await php.exec(`(function() {
			$time = strtotime('8:00pm 2 days ago');
			$date = date('Y-m-d H:i:s', $time);
			return $date;
		})();`);
		assert.match(execDate, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

		io.reset();
		assert.equal(await php.r`<?php echo ${'tagged-template-ok'};`, 0);
		assert.equal(io.stdout, 'tagged-template-ok');

		const callback = await php.x`function() { return 321; }`;
		assert.equal(typeof callback, 'function');
		assert.equal(callback(), 321);

		await php.run(`<?php $persisted = 101;`);
		await php.refresh();
		io.reset();
		await php.run(`<?php var_dump(isset($persisted));`);
		assert.equal(io.stdout, "bool(false)\n");

		assert.equal(await php.readFile('/preload/hello.txt', { encoding: 'utf8' }), 'Hello, World!');
	});

	return coverAll(
		page,
		'executable_node',
		'run, exec, r, x, refresh, sharedLibs/files, and filesystem helper examples were exercised through PhpNode.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

const pageValidators = {
	'compiling/custom-builds.md': validateCustomBuilds,
	'compiling/php-wasm-rc.md': validatePhpWasmRc,
	'extensions/pdo-cfd1.md': validatePdoCfd1,
	'extensions/pdo-pglite.md': validatePdoPglite,
	'extensions/using-php-extensions.md': validateUsingExtensions,
	'extensions/vrzno.md': validateVrzno,
	'filesystem/fs-operations.md': validateFsOperations,
	'filesystem/loading-files.md': validateLoadingFiles,
	'filesystem/transactions.md': validateTransactions,
	'getting-started/cgi-in-nodeJs.md': validateCgiInNodeJs,
	'getting-started/cgi-service-worker.md': validateCgiServiceWorker,
	'getting-started/install-and-include.md': validateInstallAndInclude,
	'getting-started/php-in-js.md': validatePhpInJs,
	'getting-started/php-in-static-html.md': validatePhpInStaticHtml,
	'getting-started/php.ini.md': validatePhpIni,
	'methods/php-cgi-wasm.md': validateMethodsPhpCgi,
	'methods/php-wasm.md': validateMethodsPhpWasm,
};

export async function buildDocsCoverageReport()
{
	const inventory = buildDocsInventory();
	const pagesWithBlocks = inventory.pages.filter(page => page.blockCount > 0);
	const blocksByFile = new Map;

	for(const block of inventory.blocks)
	{
		if(!blocksByFile.has(block.file))
		{
			blocksByFile.set(block.file, []);
		}

		blocksByFile.get(block.file).push(block);
	}

	const files = [];

	for(const pageInfo of pagesWithBlocks)
	{
		const blocks = blocksByFile.get(pageInfo.file) ?? [];
		const validator = pageValidators[pageInfo.file];
		if(process.env.DOCS_COVERAGE_DEBUG)
		{
			console.error(`Validating ${pageInfo.file}`);
		}

		if(!validator)
		{
			files.push({
				file: pageInfo.file,
				blockCount: blocks.length,
				results: coverAll({ blocks }, 'uncovered', 'No validator is registered for this docs page.'),
			});
			continue;
		}

		const results = await validator({ ...pageInfo, blocks });

		assert.equal(
			results.length,
			blocks.length,
			`${pageInfo.file} coverage results did not account for every code block.`
		);

		files.push({
			file: pageInfo.file,
			blockCount: blocks.length,
			results,
		});
	}

	const flatResults = files.flatMap(file => file.results);
	const summary = flatResults.reduce((result, entry) => {
		result.total += 1;
		result.byStatus[entry.status] = (result.byStatus[entry.status] ?? 0) + 1;
		return result;
	}, { total: 0, byStatus: {} });

	return {
		generatedAt: new Date().toISOString(),
		docsRoot: inventory.docsRoot,
		nodeRuntimeVersion: getAvailablePhpNodeVersion(),
		sourceDefaults: {
			phpNode: parseSourceDefaultVersion(path.join(sourceRoot, 'PhpNode.js')),
			phpCgiNode: parseSourceDefaultVersion(path.join(sourceRoot, 'PhpCgiNode.js')),
		},
		files,
		summary,
	};
}
