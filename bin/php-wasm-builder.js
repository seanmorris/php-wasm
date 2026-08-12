#!/usr/bin/env node
const child_process = require('node:child_process');
const path = require('path');
const fs  = require("fs");
var tty = require('tty');

const args = process.argv.slice(2);
const cwd  = process.cwd();
const repoRoot = path.resolve(__dirname, '..');
const rcFile = cwd + '/.php-wasm-rc';

const commands = {};
const print = message => process.stdout.write(`${message}\n`);
const printError = message => process.stderr.write(`${message}\n`);
const buildEnvironments = new Map([
	['web', 'web'],
	['node', 'node'],
	['worker', 'worker'],
	['webview', 'webview'],
]);
const buildModuleTypes = new Map([
	['js', 'js'],
	['mjs', 'mjs'],
]);
const buildPackageTypes = new Map([
	['base', 'base'],
	['php-wasm', 'base'],
	['cgi', 'cgi'],
	['php-cgi-wasm', 'cgi'],
	['cli', 'cli'],
	['php-cli-wasm', 'cli'],
	['dbg', 'dbg'],
	['php-dbg-wasm', 'dbg'],
]);
const runtimePackages = [
	'php-wasm',
	'php-cgi-wasm',
	'php-cli-wasm',
	'php-dbg-wasm',
];

const isGeneratedPackageArtifact = relativePath => {
	const segments = relativePath.split(path.sep);
	const basename = segments[segments.length - 1];

	if(segments.includes('mapped'))
	{
		return true;
	}

	if(basename === 'build.log')
	{
		return true;
	}

	return /\.(?:js|mjs|map|so|dat|wasm|data)$/.test(basename);
};

const ensureRuntimePackageTrees = targetRoot => {
	for(const packageName of runtimePackages)
	{
		const sourceDir = path.join(repoRoot, 'packages', packageName);
		const targetDir = path.join(targetRoot, 'packages', packageName);

		if(path.resolve(sourceDir) === path.resolve(targetDir))
		{
			continue;
		}

		fs.mkdirSync(targetDir, {recursive: true});
		fs.cpSync(sourceDir, targetDir, {
			recursive: true,
			force: true,
			filter: sourcePath => {
				const relativePath = path.relative(sourceDir, sourcePath);

				if(relativePath === '')
				{
					return true;
				}

				if(isGeneratedPackageArtifact(relativePath))
				{
					return false;
				}

				return true;
			},
		});
	}
};

const runMake = options => {
	const result = child_process.spawnSync('make', ['--no-print-directory', ...options], {
		stdio: [ 'inherit', 'inherit', 'inherit' ],
		cwd: repoRoot,
	});

	if(result.error)
	{
		throw result.error;
	}

	return result.status ?? 1;
};

const parseBuildArgs = buildArgs => {
	const selections = new Map([
		['environment', null],
		['moduleType', null],
		['packageType', null],
	]);

	for(const buildArg of buildArgs)
	{
		if(buildEnvironments.has(buildArg))
		{
			const environment = buildEnvironments.get(buildArg);
			const previous = selections.get('environment');

			if(previous !== null && previous !== environment)
			{
				throw new Error(`Error: Conflicting ENV_NAME values "${previous}" and "${environment}".`);
			}

			selections.set('environment', environment);

			continue;
		}

		if(buildModuleTypes.has(buildArg))
		{
			const moduleType = buildModuleTypes.get(buildArg);
			const previous = selections.get('moduleType');

			if(previous !== null && previous !== moduleType)
			{
				throw new Error(`Error: Conflicting MODULE_TYPE values "${previous}" and "${moduleType}".`);
			}

			selections.set('moduleType', moduleType);

			continue;
		}

		if(buildPackageTypes.has(buildArg))
		{
			const packageType = buildPackageTypes.get(buildArg);
			const previous = selections.get('packageType');

			if(previous !== null && previous !== packageType)
			{
				throw new Error(`Error: Conflicting PACKAGE_TYPE values "${previous}" and "${packageType}".`);
			}

			selections.set('packageType', packageType);

			continue;
		}

		throw new Error(`Error: Unrecognized build argument "${buildArg}". Run \`php-wasm-builder help build\`.`);
	}

	return {
		environment: selections.get('environment') ?? 'web',
		moduleType: selections.get('moduleType') ?? 'js',
		packageType: selections.get('packageType') ?? 'base',
	};
};

{ // build
	const build = (flags, ...buildArgs) => {
		const {
			environment,
			moduleType,
			packageType,
		} = parseBuildArgs(buildArgs);
		const targetName = packageType === 'base'
			? `${environment}-${moduleType}`
			: `${environment}-${packageType}-${moduleType}`;

		const options = [
			targetName,
			`PHP_BUILDER_DIR=${cwd}`,
			`BUILD_TYPE=${moduleType}`,
			`IS_TTY=${tty.isatty(process.stdout.fd) ? 1 : 0}`
		];

		options.push(`ENV_DIR=${cwd}/`);

		if(fs.existsSync(cwd + '/.php-wasm-rc'))
		{
			options.push(`ENV_FILE=${rcFile}`);
		}

		ensureRuntimePackageTrees(cwd);

		return runMake(options);
	};

	build.info = `Build one php-wasm package, optionally using a .php-wasm-rc file in the current directory.`;
	build.help = `Usage: php-wasm-builder build [ENV_NAME] [MODULE_TYPE] [PACKAGE_TYPE]

Build one php-wasm package, optionally using a .php-wasm-rc file in the current directory.

  ENV_NAME: [web, node, worker, webview]
    web:     build the web runtime (default)
    node:    build the Node.js runtime
    worker:  build the worker runtime
    webview: build the webview runtime

  MODULE_TYPE: [js, mjs]
    js:   build a CommonJS module (default)
    mjs:  build an ES module

  PACKAGE_TYPE: [base, cgi, cli, dbg]
    base: build the core php-wasm package (default)
    cgi:  build the php-cgi-wasm package
    cli:  build the php-cli-wasm package
    dbg:  build the php-dbg-wasm package

  .php-wasm-rc:
    PRELOAD_ASSETS entries that start with / or ~ are copied as-is.
    Other PRELOAD_ASSETS entries resolve relative to the current directory.
`;
	commands.build = build;
}

{ //run
	// const run = (flags, file) => {
	// 	const php = new PhpNode;

	// 	php.addEventListener('output', (event) => event.detail.forEach(l => process.stdout.write(l)));
	// 	php.addEventListener('error',  (event) => event.detail.forEach(l => process.stderr.write(l)));
	// 	php.addEventListener('ready', () => php.run(fs.readFileSync(file)));
	// };

	// run.info = 'Run a script in php-wasm.';
	// run.help = `Usage: php-wasm-builder run FILE

	// FILE - File containing the script to run.`

	// commands.run = run;
}

{ // image
	const image = (flags,) => {
		const options = ['image'];

		return runMake(options);
	};

	image.info = 'Create the build environment docker image';
	image.help = `Usage: php-wasm-builder image

Build the docker image used by php-wasm-builder.
`;

	commands.image = image;
}

{ // copy-assets
	const copy_assets = () => {
		ensureRuntimePackageTrees(cwd);

		const ls = child_process.spawnSync('npm', ['ls', '-p'], { encoding : 'utf8' });

		const allFiles = ls.stdout.split('\n').map(x=>x||'.').map(dir => {
			const json = fs.readFileSync(dir + '/package.json', {encoding: 'utf8'});
			const packageJson = JSON.parse(json);

			if(!packageJson.files)
			{
				return [];
			}

			const files = packageJson.files.filter(name => name.match(/\.(so|dat)$/)).map(file => path.join(dir, file));

			if(!files)
			{
				return [];
			}

			return files;

		}).flat();

		const options = ['--no-print-directory', '-f', 'info.mak'];

		options.push(`PHP_BUILDER_DIR=${cwd}`);

		if(fs.existsSync(cwd + '/.php-wasm-rc'))
		{
			options.push(`ENV_FILE=${rcFile}`);
		}

		const getAssetPath = child_process.spawnSync(`make`, ['get-asset-path'].concat(options), {
			cwd: __dirname + '/..', encoding : 'utf8'
		});

		const getPhpVersion = child_process.spawnSync(`make`, ['get-php-version'].concat(options), {
			cwd: __dirname + '/..', encoding : 'utf8'
		});

		const assetPath  = getAssetPath.stdout.trim();
		const phpVersion = getPhpVersion.stdout.trim();

		fs.mkdirSync(assetPath, {recursive: true});

		allFiles.forEach(file => {
			const name = path.basename(file);

			if(name.substr(0, 3) === 'php' && name.substr(3, 3) !== phpVersion)
			{
				return;
			}

			const destination = path.join(assetPath, name);

			console.error(`${file}\n => ${destination}`);

			fs.copyFileSync(file, destination);
		});
	};

	copy_assets.info = `Copy shared libs & file packages from node_modules to asset directory.`;
	copy_assets.help = `Usage: php-wasm-builder copy-assets

Scan the current package's node_modules tree for packaged .so and .dat assets,
then copy them to PHP_ASSET_DIR.
`;

	commands['copy-assets'] = copy_assets;
}

{ // build-assets
	const build_assets = () => {
		ensureRuntimePackageTrees(cwd);

		const options = [
			`PHP_BUILDER_DIR=${cwd}`,
			`IS_TTY=${tty.isatty(process.stdout.fd) ? 1 : 0}`,
		];

		options.push(`ENV_DIR=${cwd}/`);

		if(fs.existsSync(cwd + '/.php-wasm-rc'))
		{
			options.push(`ENV_FILE=${rcFile}`);
		}

		options.push('assets');

		return runMake(options);
	};

	build_assets.info = `Build shared libs & file packages to asset directory.`;
	build_assets.help = `Usage: php-wasm-builder build-assets

Build supporting assets described by the current directory's .php-wasm-rc file,
then copy them to PHP_ASSET_DIR.
`;

	commands['build-assets'] = build_assets;
}

{ // clean
	const clean = () => {
		return runMake(['clean']);
	};

	clean.info = `Clear cached build resources.`;
	clean.help = `Usage: php-wasm-builder clean

Clear cached build resources.
`;

	commands.clean = clean;
}

{ // deep-clean
	const deep_clean = () => {
		return runMake(['deep-clean']);
	};

	deep_clean.info = 'Clear out all downloaded dependencies and start from scratch.';
	deep_clean.help = `Usage: php-wasm-builder deep-clean

Clear downloaded dependencies and start the build from scratch.
`;

	commands['deep-clean'] = deep_clean;
}

{ // help
	const help = (flags, command = null) => {
		if(command)
		{
			if(!commands[command])
			{
				printError(`Error: Cannot print help for "${command}". No such command exists.`);
				process.exitCode = 1;
				return;
			}

			print(commands[command].help.trimEnd());
			return;
		}

		print('Usage: php-wasm-builder COMMAND [ARG, ...]');
		print('');
		print('Available commands:');

		for(const [commandName, command] of Object.entries(commands))
		{
			print(`  ${commandName}`);
			print(`  ${command.info}`);
			print('');
		}

		print('Run `php-wasm-builder help COMMAND` for command-specific details.');
	};

	help.info = 'Display help text for one command, or list all commands.';
	help.help = `Usage: php-wasm-builder help [COMMAND]

Print the general command list, or show detailed help for COMMAND.
`;

	commands.help = help;
}

const command = args.shift() || 'help';

const argsToFlags = args => {
	const filterdArgs = [];
	const flags = {};

	args.forEach((arg => {

		if(arg[0] !== '-')
		{
			filterdArgs.push(arg);
			return;
		}

		let offset = 1;

		if(arg[1] === '-')
		{
			offset = 2;
		}

		const index = arg.indexOf('=');

		if(index < 0)
		{
			flags[arg] = true;
			return;
		}

		flags[arg.substr(offset, index - offset)] = arg.substr(1 + index);

		return
	}))

	return [flags, ...filterdArgs];
};

let status = 0;

if(!commands[command])
{
	printError(`Error: No such command: ${command}`);
	printError('Run `php-wasm-builder help` to see available commands.');
	process.exitCode = 1;
}
else
{
	try
	{
		status = commands[command](...argsToFlags(args)) ?? 0;
	}
	catch(error)
	{
		printError(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

if(status)
{
	process.exitCode = status;
}
