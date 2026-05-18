export const query = new URLSearchParams(window.location.search);
export const runtimeVersion = query.get('version') ?? '8.4';
export const libType = query.get('libType') ?? query.get('buildType') ?? 'dynamic';
export const buildType = libType;
export const demo = query.get('demo') ?? 'hello-world.php';
export const extensionFlags = Number(query.get('extensionFlags') ?? '0');
export const variant = query.get('variant') ?? '';

const statusNode = document.querySelector('[data-testid="status"]');
const stdoutNode = document.querySelector('[data-testid="stdout"]');
const stderrNode = document.querySelector('[data-testid="stderr"]');

export const createIni = () => `
date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
expose_php=0
display_errors=Off
display_startup_errors=Off
log_errors=On
error_log=/dev/stderr
`;

export const fixtureUrl = file => new URL(`../fixtures/scripts/${file}`, import.meta.url).toString();

export const preloadFiles = [
	{
		parent: '/preload/test_www/'
		, name: 'hello-world.php'
		, url: fixtureUrl('hello-world.php')
	}
	, {
		parent: '/preload/test_www/'
		, name: 'phpinfo.php'
		, url: fixtureUrl('phpinfo.php')
	}
	, {
		parent: '/preload/'
		, name: 'list-extensions.php'
		, url: fixtureUrl('list-extensions.php')
	}
];

export const appendStdout = chunks => {
	stdoutNode.textContent += chunks.join('');
};

export const appendStderr = chunks => {
	stderrNode.textContent += chunks.join('');
};

export const setMeta = (name, value) => {
	const node = document.querySelector(`[data-testid="${name}"]`);

	if(node)
	{
		node.textContent = String(value);
	}
};

export const setStatus = value => {
	statusNode.textContent = value;
	document.body.dataset.status = value;
};

export const loadFixtureScript = async file => {
	const response = await fetch(fixtureUrl(file));

	if(!response.ok)
	{
		throw new Error(`Unable to load fixture: ${file}`);
	}

	return response.text();
};
