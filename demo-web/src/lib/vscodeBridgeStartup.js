export const SUPPORTED_PHP_VERSIONS = ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];
const GENERATED_CONFIG_PREFIX = 'PHP DBG Wasm: Current File';
export const GENERATED_FILES_ASSOCIATIONS = {
	'*.module': 'php'
	, '*.inc': 'php'
};
export const STARTUP_BRIDGE_RETRY_OPTIONS = {
	attempts: 8
	, delayMs: 125
};

const delay = timeoutMs => new Promise(resolve => setTimeout(resolve, timeoutMs));

const isOpaqueBridgeFailure = error => {
	if(!error)
	{
		return true;
	}

	if(error instanceof Error)
	{
		return false;
	}

	if(typeof error !== 'object')
	{
		return false;
	}

	const message = typeof error.message === 'string'
		? error.message.trim()
		: '';
	const code = typeof error.code === 'string'
		? error.code.trim()
		: '';

	return !message && !code;
};

export const callClientMethodWithRetry = async (
	client
	, method
	, args = []
	, {attempts = 1, delayMs = 0} = {}
) => {
	if(typeof client?.[method] !== 'function')
	{
		throw new TypeError(`VS Code client method "${method}" is not available.`);
	}

	let lastError;

	for(let attempt = 1; attempt <= attempts; attempt += 1)
	{
		try
		{
			return await client[method](...args);
		}
		catch(error)
		{
			lastError = error;

			if(attempt >= attempts || !isOpaqueBridgeFailure(error))
			{
				throw error;
			}

			if(delayMs > 0)
			{
				await delay(delayMs);
			}
		}
	}

	throw lastError;
};

export const getAssociatedLanguageId = path => {
	if(!path)
	{
		return null;
	}

	return Object.entries(GENERATED_FILES_ASSOCIATIONS)
		.find(([pattern]) => {
			const suffix = pattern.startsWith('*.')
				? pattern.slice(1)
				: pattern;

			return path.endsWith(suffix);
		})
		?.[1] ?? null;
};

export const createGeneratedLaunchConfigurations = (defaultVersion = '8.3') => {
	void defaultVersion;
	const orderedVersions = [...SUPPORTED_PHP_VERSIONS].sort((left, right) => {
		return Number.parseFloat(right) - Number.parseFloat(left);
	});

	return orderedVersions.map(version => ({
		type: 'dbgBus'
		, request: 'launch'
		, name: `${GENERATED_CONFIG_PREFIX} (PHP ${version})`
		, program: '${file}'
		, version
	}));
};

export const listOpenBreakpointsFor = bridge => {
	if(typeof bridge?.listOpenBreakpoints === 'function')
	{
		return callClientMethodWithRetry(
			bridge
			, 'listOpenBreakpoints'
			, []
			, STARTUP_BRIDGE_RETRY_OPTIONS
		);
	}

	if(typeof bridge?.executeDebugCommand === 'function')
	{
		return callClientMethodWithRetry(
			bridge
			, 'executeDebugCommand'
			, ['dbgBus.listOpenBreakpoints']
			, STARTUP_BRIDGE_RETRY_OPTIONS
		);
	}

	throw new TypeError('VS Code breakpoint bridge is not available.');
};
