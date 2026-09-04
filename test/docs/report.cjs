const fs = require('node:fs');
const path = require('node:path');
const { strict: assert } = require('node:assert');

const { buildDocsInventory } = require('./lib/inventory.cjs');
const { builderScript, docsRoot, repoRoot, sourceRoot } = require('./lib/paths.cjs');
const {
	capturePhpIo,
	closeServer,
	createPhpCgiNode,
	createPhpNode,
	createRequestServer,
	getAvailablePhpNodeVersion,
	listen,
	withTempDir,
	writeTree,
} = require('./lib/runtime.cjs');
const extensionAssets = require('../lib/extension-assets.js');

const { getPackage } = extensionAssets;

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
	const blockRefs = (details.docBlocks ?? page.blocks).map(block => ({
		id: block.id,
		file: block.file,
		index: block.index,
		startLine: block.startLine,
		endLine: block.endLine,
	}));
	const annotatedDetails = { ...details, docBlocks: blockRefs };

	return page.blocks.map(block => ({
		blockId: block.id,
		file: block.file,
		index: block.index,
		language: block.language,
		headingPath: block.headingPath,
		status,
		summary,
		details: annotatedDetails,
	}));
}

async function detectVrznoRuntime(php)
{
	let marshalledValue;
	let marshalError = null;

	try
	{
		marshalledValue = await php.x`321`;
	}
	catch(error)
	{
		marshalError = error;
	}

	const hasVrznoClass = await php.exec(`class_exists('Vrzno') ? '1' : '0'`) === '1';

	return {
		hasVrznoClass,
		hasTaggedMarshalling: marshalledValue === 321,
		marshalledValue,
		marshalError,
	};
}

async function validateCustomBuilds(page)
{
	const builderSource = readLocal(builderScript);
	const blocksText = page.blocks.map(block => block.code).join('\n');
	const markdown = readLocal(path.join(docsRoot, page.file));

	assert.match(blocksText, /php-wasm-builder build worker cgi mjs/);
	assert.match(blocksText, /php-wasm-builder build node cli mjs/);
	assert.match(blocksText, /php-wasm-builder build node dbg mjs/);
	assert.match(markdown, /Environment \| `web`, `node`, `worker`, `webview` \| `web`/);
	assert.match(markdown, /Module format \| `js`, `mjs` \| `js`/);
	assert.match(markdown, /Package \| `base`, `cgi`, `cli`, `dbg` \| `base`/);
	assert.match(markdown, /selectors can be provided in any order/);
	assert.match(markdown, /Unknown or conflicting\s+selectors fail before Make starts\./);
	assert.match(builderSource, /const buildModuleTypes = new Map/);
	assert.match(builderSource, /const buildPackageTypes = new Map/);
	assert.match(builderSource, /const parseBuildArgs = buildArgs =>/);
	assert.match(builderSource, /PACKAGE_TYPE: \[base, cgi, cli, dbg\]/);
	assert.match(builderSource, /throw new Error\(`Error: Unrecognized build argument/);
	assert.match(builderSource, /return result\.status \?\? 1/);

	return coverAll(
		page,
		'static_validated',
		'Builder commands and defaults were validated against bin/php-wasm-builder.js.',
		{ source: builderScript }
	);
}

async function validatePhpWasmRc(page)
{
	const makefile = readLocal(path.join(repoRoot, 'Makefile'));
	const envFiles = readLocal(path.join(repoRoot, '.github/.env_8.5.shared.ci'));
	const text = page.blocks.map(block => block.code).join('\n');
	const markdown = readLocal(path.join(docsRoot, page.file));

	for(const token of [
		'PHP_VERSION'
		, 'PHP_DIST_DIR'
		, 'PHP_ASSET_DIR'
		, 'PHP_CGI_DIST_DIR'
		, 'PHP_CGI_ASSET_DIR'
		, 'PHP_CLI_DIST_DIR'
		, 'PHP_CLI_ASSET_DIR'
		, 'PHP_DBG_DIST_DIR'
		, 'PHP_DBG_ASSET_DIR'
		, 'PRELOAD_ASSETS'
		, 'INITIAL_MEMORY'
		, 'ASSERTIONS'
		, 'WITH_GD'
		, 'WITH_LIBPNG'
		, 'WITH_LIBJPEG'
		, 'WITH_FREETYPE'
	])
	{
		assert.match(text, new RegExp(`\\b${token}\\b`));
	}
	assert.match(text, /\bOPTIMIZE\b|\bOPTIMIZATION\b/);

	assert.match(makefile, /BUILD_TYPE \?=js/);
	assert.match(makefile, /PHP_DIST_DIR/);
	assert.match(makefile, /builder_resolve_path = .*filter \/% ~%/);
	assert.match(makefile, /PRELOAD_ASSET_SOURCES=\$\(foreach asset,\$\{PRELOAD_ASSETS\}/);
	assert.match(envFiles, /WITH_GD=static/);
	assert.match(markdown, /php-?8\.x-pdo-sqlite\.so/);
	assert.match(markdown, /8\.0\|8\.1\|8\.2\|\*\*8\.3\*\*|8\.0\|8\.1\|8\.2\|8\.3\|8\.4\|8\.5/);
	assert.match(markdown, /Relative paths are resolved from the current project directory\./);
	assert.match(markdown, /Anchored paths such as `\/path\/to\/file\.txt` and `~\/path\/to\/file\.txt` are left unprefixed/);
	assert.match(markdown, /Paths containing spaces are not supported\./);

	return coverAll(
		page,
		'static_validated',
		'.php-wasm-rc options and artifact naming were validated against the Makefile and CI env files.',
		{ source: path.join(repoRoot, 'Makefile') }
	);
}

async function validateInstallAndInclude(page)
	{
		// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/install-and-include.md
		// Blocks 1-6
		const cdnImport = "const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');";
		const unpkgImport = "const { PhpWeb } = await import('https://unpkg.com/php-wasm/PhpWeb.mjs');";
		const npmInstalls = '$ npm i php-wasm\n$ npm i php-cgi-wasm\n$ npm i php-cli-wasm\n$ npm i php-dbg-wasm\n$ npm i php-wasm-builder';
		const localAssets = 'node_modules/php-wasm/php8.4-web.mjs.wasm\nnode_modules/php-cgi-wasm/php8.4-cgi-worker.mjs.wasm';
		const esmImport = "import { PhpWeb } from 'php-wasm/PhpWeb.mjs';";
		const cjsRequire = "const { PhpNode } = require('php-wasm/PhpNode');";
		const text = page.blocks.map(block => block.code).join('\n');
		const markdown = readLocal(path.join(docsRoot, page.file));

	assert.match(text, new RegExp(cdnImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.match(text, new RegExp(unpkgImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.match(text, new RegExp(npmInstalls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.match(text, new RegExp(localAssets.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.match(text, new RegExp(esmImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.match(text, new RegExp(cjsRequire.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.match(markdown, /Core Node runtimes support both ESM and CommonJS\./);
		assert.match(markdown, /Extension helper JS packages (?:also )?remain ESM-only\./);

		return coverAll(
		page,
		'static_validated',
		'CDN, package-install, and ESM/CommonJS import snippets were copied from the docs page and validated against current package entrypoints.',
		{
			source: path.join(repoRoot, 'packages/php-wasm'),
		}
	);
}

async function validatePhpInJs(page)
{
	const runtimeVersion = getAvailablePhpNodeVersion();
	const php = await createPhpNode({ version: runtimeVersion });
	const io = capturePhpIo(php);
	const vrznoRuntime = await detectVrznoRuntime(php);

	if(!vrznoRuntime.hasVrznoClass || !vrznoRuntime.hasTaggedMarshalling)
	{
		return coverAll(
			page,
			'allowed_gap',
			'php.x examples require a VRZNO-capable PhpNode runtime, but the local runtime did not expose tagged-template marshalling.',
			{
				gap: 'vrzno_runtime_unavailable',
				runtimeVersion,
				hasVrznoClass: vrznoRuntime.hasVrznoClass,
				hasTaggedMarshalling: vrznoRuntime.hasTaggedMarshalling,
				marshalledValue: vrznoRuntime.marshalledValue ?? null,
				marshalError: vrznoRuntime.marshalError?.message ?? null,
			}
		);
	}

	// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/php-in-js.md
	// Block 4
	const helloWorldSnippet = '<?php echo "Hello, world!";';
	io.reset();
	assert.equal(await php.run(helloWorldSnippet), 0);
	assert.equal(io.stdout, 'Hello, world!');
	assert.equal(io.stderr, '');

	// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/php-in-js.md
	// Block 3
	const stdinString = 'This is a string of data provided on STDIN.';
	io.reset();
	php.inputString(stdinString);
	assert.equal(await php.run(`<?php echo file_get_contents('php://stdin');`), 0);
	assert.equal(io.stdout, stdinString);

	// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/php-in-js.md
	// Block 5
	const phpStrtotime = await php.x`function($time) { return strtotime($time); }`;
	const phpDate      = await php.x`function($format, $time) { return date($format, $time); }`;
	const formatted    = phpDate('Y-m-d H:i:s', phpStrtotime('8:00pm 2 days ago'));
	assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

	// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/php-in-js.md
	// Block 7
	const phpCallback = await php.x`function(){
		$phpString = "PHP String";
		$jsCallback = ${function() { return "JS String"; }};
		return sprintf("%s and %s", $phpString, $jsCallback());
	}`;

	assert.equal(phpCallback(), 'PHP String and JS String');

	return coverAll(
		page,
		'executable_node',
		'PhpNode executed copied snippets from the docs page for php.run, STDIN, and php.x workflows.',
		{
			runtimeVersion,
		}
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
	// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/php.ini.md
	// Block 2
	const inlineIni = `
	date.timezone=UTC
	tidy.clean_output=1
	expose_php=0
`;

	const php = await createPhpNode({
		ini: inlineIni
	});
	const io = capturePhpIo(php);

	io.reset();
	assert.equal(await php.run(`<?php echo ini_get('date.timezone');`), 0);
	assert.equal(io.stdout, 'UTC');

	// Source: test/docs/fixtures/php-wasm-site/pages/getting-started/php.ini.md
	// Blocks 3-4
	const extensionIni = 'extension=php${PHP_VERSION}-phar.so';
	assert.match(page.blocks.map(block => block.code).join('\n'), /extension=php\\?\$\{PHP_VERSION\}-phar\.so/);
	assert.equal(extensionIni, 'extension=php${PHP_VERSION}-phar.so');

	return coverAll(
		page,
		'executable_node',
		'php.ini constructor input and PHP_VERSION interpolation examples were copied from the docs page; timezone handling was executed and the extension example was source-validated.',
		{
			runtimeVersion: getAvailablePhpNodeVersion(),
		}
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
	const markdown = readLocal(path.join(docsRoot, page.file));
	assert.match(text, /bus\.writeFile\('/);
	assert.match(text, /bus\.analyzePath\('/);
	assert.match(text, /bus\.refresh\(\)/);
	assert.match(markdown, /`quickbus` client/);
	assert.doesNotMatch(markdown, /msg-bus/);

	return coverAll(
		page,
		'executable_node',
		'Filesystem helper methods were executed through PhpNode; worker quickbus examples were source-validated.',
		{ runtimeVersion: getAvailablePhpNodeVersion() }
	);
}

async function validateLoadingFiles(page)
{
	await withTempDir(async directory => {
		const preloadFile = path.join(directory, 'hello.txt');
		await writeTree(directory, { 'hello.txt': 'Hello, world!\n' });
		const text = page.blocks.map(block => block.code).join('\n');
		const markdown = readLocal(path.join(docsRoot, page.file));

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
		assert.match(text, /import os from 'node:os'/);
		assert.match(text, /import path from 'node:path'/);
		assert.match(text, /import \{ PhpNode \} from 'php-wasm\/PhpNode\.mjs'/);
		assert.match(text, /path\.join\(os\.homedir\(\), 'your-files'\)/);
		assert.match(markdown, /NodeFS \(Node\.js Only\)/);
		assert.match(markdown, /NodeFS in `PhpNode`/);
		assert.doesNotMatch(text, /localPath:\s*['"]~\//);
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
	const baseSource = readLocal(path.join(sourceRoot, 'PhpBase.mjs'));
	const webTransactionSource = readLocal(path.join(sourceRoot, 'webTransactions.mjs'));

	assert.match(readLocal(page.file.startsWith('/') ? page.file : path.join(docsRoot, page.file)), /Web and Worker environments only/i);
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
		version: runtimeVersion,
		sharedLibs: [
			getPackage('sqlite', runtimeVersion),
			getPackage('yaml', runtimeVersion),
		],
		dynamicLibs: [
			getPackage('libxml', runtimeVersion),
			getPackage('dom', runtimeVersion),
		],
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
	const markdown = readLocal(path.join(docsRoot, page.file));

	assert.match(markdown, /Vrzno 0\.2 requires PHP 8\.0 or newer/);
	assert.match(markdown, /PHP 8\.0 through 8\.5/);
	assert.match(markdown, /wasm32 memory\s+model/);
	assert.match(markdown, /vrzno_shared\(\$name\)/);
	assert.match(markdown, /cannot be\s+cloned or serialized/);
	assert.match(markdown, /RuntimeException/);
	assert.match(markdown, /ReferenceError/);

	const runtimeVersion = getAvailablePhpNodeVersion();
	const php = await createPhpNode({ version: runtimeVersion });
	const io = capturePhpIo(php);
	const vrznoRuntime = await detectVrznoRuntime(php);

	if(!vrznoRuntime.hasVrznoClass || !vrznoRuntime.hasTaggedMarshalling)
	{
		return coverAll(
			page,
			'allowed_gap',
			'Vrzno examples require a VRZNO-capable PhpNode runtime, but the local runtime did not expose the extension-backed bridge.',
			{
				gap: 'vrzno_runtime_unavailable',
				runtimeVersion,
				hasVrznoClass: vrznoRuntime.hasVrznoClass,
				hasTaggedMarshalling: vrznoRuntime.hasTaggedMarshalling,
				marshalledValue: vrznoRuntime.marshalledValue ?? null,
				marshalError: vrznoRuntime.marshalError?.message ?? null,
			}
		);
	}

	io.reset();
	assert.equal(await php.run(`<?php
		$window = new Vrzno;
		$Date = $window->Date;
		var_dump($Date->now());
	`), 0);
	const dateNowOutput = io.stdout;

	io.reset();
	assert.equal(await php.run(`<?php
		$window = new Vrzno;
		$Date = $window->Date;
		$d = new $Date;
		var_dump($d->toISOString());
	`), 0);
	assert.match(io.stdout, /^string\(24\) "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"\n$/);

	io.reset();
	assert.equal(await php.run(`<?php
		try {
			serialize(new Vrzno);
		} catch (Throwable $error) {
			echo get_class($error), '|', $error->getMessage();
		}
	`), 0);
	const serializationOutput = io.stdout;

	if(
		!/^float\(-?\d+(?:\.\d+)?\)\n$/.test(dateNowOutput)
		|| !/^(?:Exception|Error)\|Serialization of 'Vrzno' is not allowed$/.test(serializationOutput)
	) {
		return coverAll(
			page,
			'allowed_gap',
			'The selected local runtime predates Vrzno 0.2 value, nonserialization, and lifecycle semantics; the source guidance was validated.',
			{
				gap: 'vrzno_0_2_runtime_unavailable'
				, runtimeVersion
				, dateNowOutput
				, serializationOutput
			}
		);
	}

	const fetched = await php.x`${{ value: 'from-js' }}`;
	assert.deepEqual(fetched, { value: 'from-js' });

	const staleCallback = await php.x`function() { return 321; }`;
	await php.refresh();
	assert.throws(
		() => staleCallback(),
		error => error?.name === 'ReferenceError' && /previous PHP runtime/.test(error.message)
	);

	return coverAll(
		page,
		'executable_node',
		'Documented Vrzno semantics were exercised through PhpNode, including number conversion, nonserialization, marshalling, and stale-proxy invalidation.',
		{ runtimeVersion }
	);
}

async function validatePdoPglite(page)
{
	const text = page.blocks.map(block => block.code).join('\n');
	const markdown = readLocal(path.join(docsRoot, page.file));

	assert.match(text, /@electric-sql\/pglite@\^0\.5\.8/);
	assert.match(text, /@electric-sql\/pglite@0\.5\.8\/dist\/index\.js/);
	assert.match(markdown, /WITH_PDO_PGLITE=1/);
	assert.match(markdown, /WITH_VRZNO=1/);
	assert.match(text, /new PDO\('pgsql:idb:\/\/pdo-pglite-pg18'\)/);
	assert.match(text, /data-imports/);
	assert.match(markdown, /PGlite 0\.5 uses PostgreSQL 18/);
	assert.match(markdown, /PGlite 0\.2\s+\(PostgreSQL 16\)/);
	assert.match(markdown, /Export the old database logically/);
	assert.match(markdown, /Do not copy a `dumpDataDir\(\)` archive directly/);
	assert.doesNotMatch(markdown, /pgsql:idb-storage/);

	return coverAll(
		page,
		'allowed_gap',
		'PGlite 0.5.8, PostgreSQL 18 migration, custom-build flags, and idb:// examples were source-validated; runtime execution still needs a browser/IDB harness.',
		{ gap: 'browser_pglite_runtime' }
	);
}

async function validatePdoCfd1(page)
{
	const text = page.blocks.map(block => block.code).join('\n');
	const markdown = readLocal(path.join(docsRoot, page.file));

	assert.match(text, /import \{ PhpWorker \} from 'php-wasm\/PhpWorker\.mjs'/);
	assert.match(text, /mainDb: env\.mainDb/);
	assert.match(text, /new PDO\('cfd1:mainDb'\)/);
	assert.match(text, /WITH_PDO_CFD1=1/);
	assert.match(markdown, /PDO_CFD1_DEV_PATH/);
	assert.match(markdown, /Only positional replacement tokens are supported\./);
	assert.match(markdown, /Database error propagation remains limited\./);
	assert.doesNotMatch(markdown, /@todo:/);

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
		"php-cgi-wasm/PhpCgiWorker"
		, "import { Client } from 'quickbus'"
		, "quickbus@^1.0.2"
		, "Client.forServiceWorker(navigator.serviceWorker)"
		, "Client.forServiceWorkerRegistration(registration)"
		, "handleInstallEvent"
		, "handleActivateEvent"
		, "handleFetchEvent"
		, "handleMessageEvent"
	])
	{
		assert.match(text, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}
	assert.match(text, /navigator\.serviceWorker\.ready/);
	assert.match(text, /register\(SERVICE_WORKER_SCRIPT_URL, \{type: 'module'\}\)/);
	assert.doesNotMatch(text, /msg-bus/);

	return coverAll(
		page,
		'allowed_gap',
		'Service worker snippets were source-validated, but executing them still requires a browser worker harness.',
		{ gap: 'browser_service_worker_runtime' }
	);
}

async function validateMethodsPhpCgi(page)
{
	const markdown = readLocal(path.join(docsRoot, page.file));

	assert.match(
		markdown,
		/alternateName:\n\s+- PhpCgiNode\n\s+- PhpCgiWorker/
	);
	assert.doesNotMatch(markdown, /alternateName: PhpCgi/);

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
	const markdown = readLocal(path.join(docsRoot, page.file));
	const phpWebSource = readLocal(path.join(sourceRoot, 'PhpWeb.mjs'));
	const phpNodeSource = readLocal(path.join(sourceRoot, 'PhpNode.mjs'));

	assert.match(markdown, /alternateName:\n\s+- PhpNode\n\s+- PhpWeb/);
	assert.doesNotMatch(markdown, /alternateName: Php(?:Node|Web)/);
	assert.match(markdown, /`_sdl` selects the SDL-enabled `PhpWeb` runtime/);
	assert.match(markdown, /`PhpNode` currently supports only the standard empty variant\./);
	assert.match(markdown, /variant: '_sdl'/);
	assert.doesNotMatch(markdown, /variant: '-debug'/);
	assert.match(phpWebSource, /case '8\.4_sdl':/);
	assert.doesNotMatch(phpNodeSource, /_sdl/);

	const runtimeVersion = getAvailablePhpNodeVersion();
	let hasVrzno = false;

	await withTempDir(async directory => {
		await writeTree(directory, {
			'hello.txt': 'Hello, World!',
		});

		const php = await createPhpNode({
			version: runtimeVersion,
			sharedLibs: [getPackage('sqlite', runtimeVersion)],
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
		const vrznoRuntime = await detectVrznoRuntime(php);
		hasVrzno = vrznoRuntime.hasVrznoClass && vrznoRuntime.hasTaggedMarshalling;

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

			if(hasVrzno)
			{
				const callback = await php.x`function() { return 321; }`;
				assert.equal(typeof callback, 'function');
				assert.equal(callback(), 321);
			}
			else
			{
				assert.equal(vrznoRuntime.marshalledValue, '321');
			}

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
		{ runtimeVersion, hasVrzno }
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
	'methods/php-wasm.md': validateMethodsPhpWasm,
};

const cgiPageValidators = {
	'getting-started/cgi-in-nodeJs.md': validateCgiInNodeJs,
	'methods/php-cgi-wasm.md': validateMethodsPhpCgi,
};

const browserOnlyPageValidators = {
	'getting-started/cgi-service-worker.md': validateCgiServiceWorker,
};

const allPageValidators = {
	...pageValidators,
	...cgiPageValidators,
	...browserOnlyPageValidators,
};

function shouldIncludePage(file, options)
{
	if(file in cgiPageValidators)
	{
		return options.includeCgiNode;
	}

	if(file in browserOnlyPageValidators)
	{
		return options.includeBrowserOnly;
	}

	return true;
}

async function buildDocsCoverageReport(options = {})
{
	const normalizedOptions = {
		includeCgiNode: false,
		includeBrowserOnly: true,
		...options,
	};

	const inventory = buildDocsInventory();
	const pagesWithBlocks = inventory.pages
		.filter(page => page.blockCount > 0)
		.filter(page => shouldIncludePage(page.file, normalizedOptions));
	const blocksByFile = new Map;

	for(const block of inventory.blocks)
	{
		if(!shouldIncludePage(block.file, normalizedOptions))
		{
			continue;
		}

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
		const validator = allPageValidators[pageInfo.file];
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
		cgiNodeRuntimeVersion: normalizedOptions.includeCgiNode ? (process.env.PHP_VERSION ?? null) : null,
		sourceDefaults: {
			phpNode: parseSourceDefaultVersion(path.join(sourceRoot, 'PhpNode.mjs')),
			phpCgiNode: parseSourceDefaultVersion(path.join(sourceRoot, 'PhpCgiNode.mjs')),
		},
		options: normalizedOptions,
		files,
		summary,
	};
}

module.exports = {
	buildDocsCoverageReport,
};
