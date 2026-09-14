import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fs.realpathSync(process.cwd());
const sourceDirectory = 'third_party/waitline';
const stateName = '.php-wasm-source.json';
const pendingName = '.php-wasm-pending.json';
const hash = data => createHash('sha256').update(data).digest('hex');
const isInput = name => typeof name === 'string'
	&& !name.includes('/') && !name.includes('\\')
	&& /^(?:.+\.(?:c|h)|.+\.stub\.php|config\.(?:m4|w32)|README\.md|CREDITS|LICENSE)$/.test(name);
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

function extensionDirectory(version)
{
	if(!/^\d+\.\d+$/.test(version ?? '')) throw new Error('A PHP major.minor version is required');
	return `third_party/php${version}-src/ext/waitline`;
}

// All writable locations are fixed descendants of the build workspace. Never
// follow a destination symlink, including one in an intermediate directory.
function checkedPath(relative)
{
	const absolute = path.resolve(root, relative);
	if(!inside(root, absolute) || absolute === root) throw new Error(`Unsafe import destination: ${relative}`);
	let current = root;
	for(const part of path.relative(root, absolute).split(path.sep))
	{
		current = path.join(current, part);
		try
		{
			if(fs.lstatSync(current).isSymbolicLink())
			{
				throw new Error(`Refusing symlinked import destination: ${current}`);
			}
		}
		catch(error)
		{
			if(error.code !== 'ENOENT') throw error;
		}
	}
	return absolute;
}

function normalizeSnapshot(snapshot, withData = true)
{
	if(snapshot?.schema !== 1 || !Array.isArray(snapshot.files)) throw new Error('Invalid Waitline source manifest');
	const identity = snapshot.identity;
	if(!identity || !['dev', 'pinned'].includes(identity.mode)
		|| (identity.mode === 'dev' && typeof identity.path !== 'string')
		|| (identity.mode === 'pinned' && ['repository', 'ref', 'commit'].some(key => typeof identity[key] !== 'string')))
	{
		throw new Error('Invalid Waitline source identity');
	}
	const names = new Set;
	const files = snapshot.files.map(file => {
		if(!isInput(file.name) || names.has(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256))
		{
			throw new Error('Invalid Waitline input inventory');
		}
		names.add(file.name);
		const result = { name: file.name, sha256: file.sha256 };
		if(withData)
		{
			if(typeof file.data !== 'string') throw new Error(`Missing input: ${file.name}`);
			const data = Buffer.from(file.data, 'base64');
			if(data.toString('base64') !== file.data || hash(data) !== file.sha256)
			{
				throw new Error(`Corrupt input: ${file.name}`);
			}
			result.data = file.data;
		}
		return result;
	}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	for(const name of ['waitline.c', 'config.m4'])
	{
		if(!names.has(name)) throw new Error(`Missing required Waitline input: ${name}`);
	}
	const origin = identity.mode === 'dev'
		? { mode: 'dev', path: identity.path }
		: { mode: 'pinned', repository: identity.repository, ref: identity.ref, commit: identity.commit };
	return { schema: 1, identity: origin, files };
}

function input(name, data)
{
	return { name, sha256: hash(data), data: data.toString('base64') };
}

function developmentSnapshot(directory, version)
{
	const source = fs.realpathSync(directory);
	for(const relative of [sourceDirectory, extensionDirectory(version)])
	{
		const destination = path.resolve(root, relative);
		if(inside(destination, source) || inside(source, destination))
		{
			throw new Error('WAITLINE_DEV_PATH must not overlap an importer destination');
		}
	}
	const files = fs.readdirSync(source).filter(isInput).sort().map(name => {
		const filename = path.join(source, name);
		if(!fs.statSync(filename).isFile()) throw new Error(`Not a regular source file: ${filename}`);
		return input(name, fs.readFileSync(filename));
	});
	return normalizeSnapshot({ schema: 1, identity: { mode: 'dev', path: source }, files });
}

function pinnedSnapshot(repository, ref)
{
	if(!repository || !ref) throw new Error('WAITLINE_REPOSITORY and WAITLINE_REF are required');
	const cache = checkedPath(`.cache/waitline-import/${hash(repository)}`);
	fs.mkdirSync(cache, { recursive: true });
	const git = (...args) => execFileSync('git', ['-c', `safe.directory=${cache}`, '-C', cache, ...args], {
		stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
	});
	if(!fs.existsSync(path.join(cache, 'HEAD'))) git('init', '--bare', '.');
	let commit;
	if(/^[a-f0-9]{40}$/i.test(ref))
	{
		try { commit = git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim(); }
		catch { /* Immutable commits are fetched only when absent from the cache. */ }
	}
	if(!commit)
	{
		git('fetch', '--depth', '1', '--no-tags', '--', repository, ref);
		commit = git('rev-parse', '--verify', 'FETCH_HEAD^{commit}').toString().trim();
	}
	const files = [];
	for(const entry of git('ls-tree', '-z', commit).toString().split('\0').filter(Boolean))
	{
		const tab = entry.indexOf('\t');
		const name = entry.slice(tab + 1);
		if(!isInput(name)) continue;
		const [mode, type, object] = entry.slice(0, tab).split(' ');
		if(type !== 'blob' || !['100644', '100755'].includes(mode))
		{
			throw new Error(`Not a regular pinned source file: ${name}`);
		}
		files.push(input(name, git('cat-file', 'blob', object)));
	}
	return normalizeSnapshot({ schema: 1, identity: { mode: 'pinned', repository, ref, commit }, files });
}

function readState(directory)
{
	const filename = checkedPath(path.join(directory, stateName));
	if(!fs.existsSync(filename)) return null;
	try
	{
		return normalizeSnapshot(JSON.parse(fs.readFileSync(filename, 'utf8')), false);
	}
	catch(error)
	{
		if(error.code) throw error;
		process.stderr.write(`Waitline import: replacing invalid generated manifest ${filename}\n`);
		return null;
	}
}

function synchronize(relative, snapshot)
{
	snapshot = normalizeSnapshot(snapshot);
	const desired = normalizeSnapshot(snapshot, false);
	const destination = checkedPath(relative);
	const previous = readState(relative);
	const pendingPath = checkedPath(path.join(relative, pendingName));
	let pending = null;
	if(fs.existsSync(pendingPath))
	{
		pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
		if(pending?.schema !== 1 || !Array.isArray(pending.files) || !pending.files.every(isInput))
		{
			throw new Error('Invalid pending Waitline input inventory');
		}
	}
	const names = new Set(desired.files.map(file => file.name));
	// Migrate old imports (or recover an invalid marker) by adopting only the
	// documented root-level input classes, never build outputs or whole trees.
	const managed = previous?.files ?? (fs.existsSync(destination)
		? fs.readdirSync(destination).filter(isInput).map(name => ({ name })) : []);
	const managedNames = new Set([...managed.map(file => file.name), ...(pending?.files ?? [])]);
	const obsolete = [...managedNames].filter(name => !names.has(name)).map(name => ({ name }));
	let changed = pending !== null || JSON.stringify(previous) !== JSON.stringify(desired);
	for(const file of [...desired.files, ...obsolete])
	{
		const filename = checkedPath(path.join(relative, file.name));
		if(fs.existsSync(filename) && !fs.statSync(filename).isFile())
		{
			throw new Error(`Not a regular destination file: ${filename}`);
		}
		if(names.has(file.name) && (!fs.existsSync(filename) || hash(fs.readFileSync(filename)) !== file.sha256))
		{
			changed = true;
		}
	}
	if(!changed) return;
	fs.mkdirSync(destination, { recursive: true });
	const temporary = fs.mkdtempSync(path.join(destination, '.php-wasm-import-'));
	try
	{
		// Refresh every translation unit on changes, including header-only changes.
		// A no-op import leaves both input and manifest mtimes untouched.
		for(const file of snapshot.files)
		{
			fs.writeFileSync(path.join(temporary, file.name), Buffer.from(file.data, 'base64'));
		}
		fs.writeFileSync(path.join(temporary, stateName), JSON.stringify(desired, null, 2) + '\n');
		// Journal the full union before publishing any source files. A failed B
		// import can add files absent from the still-valid A manifest; subsequent
		// A/C imports must know those names without deleting unrelated files.
		const journal = { schema: 1, files: [...new Set([...managedNames, ...names])].sort() };
		fs.writeFileSync(path.join(temporary, pendingName), JSON.stringify(journal) + '\n');
		fs.renameSync(path.join(temporary, pendingName), pendingPath);
		for(const file of snapshot.files)
		{
			fs.renameSync(path.join(temporary, file.name), path.join(destination, file.name));
		}
		for(const file of obsolete)
		{
			const filename = path.join(destination, file.name);
			if(fs.existsSync(filename)) fs.unlinkSync(filename);
		}
		// Publish last. On interruption, the next forced content check repairs any
		// partially copied files instead of trusting a successful-looking marker.
		fs.renameSync(path.join(temporary, stateName), path.join(destination, stateName));
		fs.unlinkSync(pendingPath);
	}
	finally
	{
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}

async function main()
{
	const [command, first, second] = process.argv.slice(2);
	if(command === 'snapshot')
	{
		// Finish every host read before emitting any bytes to the builder.
		process.stdout.write(JSON.stringify(developmentSnapshot(first, second)));
	}
	else if(command === 'stage')
	{
		let snapshot;
		if(first === '--stdin')
		{
			const chunks = [];
			for await(const chunk of process.stdin) chunks.push(chunk);
			snapshot = JSON.parse(Buffer.concat(chunks).toString());
		}
		else snapshot = pinnedSnapshot(first, second);
		synchronize(sourceDirectory, snapshot);
	}
	else if(command === 'sync')
	{
		const state = readState(sourceDirectory);
		if(!state) throw new Error('Waitline staging manifest is missing');
		const files = state.files.map(file => ({ ...file,
			data: fs.readFileSync(checkedPath(path.join(sourceDirectory, file.name))).toString('base64'),
		}));
		synchronize(extensionDirectory(first), { ...state, files });
	}
	else throw new Error('Expected snapshot DEV_PATH PHP_VERSION, stage REPOSITORY REF|--stdin, or sync PHP_VERSION');
}

main().catch(error => {
	process.stderr.write(`Waitline import failed: ${error.message}\n`);
	process.exitCode = 1;
});
