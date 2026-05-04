import {
	callClientMethodWithRetry
	, createGeneratedLaunchConfigurations
	, listOpenBreakpointsFor
	, SUPPORTED_PHP_VERSIONS
} from '../lib/vscodeBridgeStartup';

describe('VSCodeEditor launch config generation', () => {
	it('keeps PHP 8.3 first by default and preserves the configured support list', () => {
		expect(SUPPORTED_PHP_VERSIONS).toEqual(['8.0', '8.1', '8.2', '8.3', '8.4', '8.5']);

		expect(
			createGeneratedLaunchConfigurations().map(configuration => configuration.version)
		).toEqual(['8.3', '8.0', '8.1', '8.2', '8.4', '8.5']);
	});

	it('reorders generated launch configs around the requested default version', () => {
		expect(
			createGeneratedLaunchConfigurations('8.5').map(configuration => configuration.version)
		).toEqual(['8.5', '8.0', '8.1', '8.2', '8.3', '8.4']);
	});

	it('requests open breakpoints through the stable debug command bridge', async () => {
		const executeDebugCommand = vi.fn().mockResolvedValue([{location: {uri: 'busfs:/persist/drupal-7.95/index.php'}}]);

		await expect(
			listOpenBreakpointsFor({executeDebugCommand})
		).resolves.toEqual([{location: {uri: 'busfs:/persist/drupal-7.95/index.php'}}]);

		expect(executeDebugCommand).toHaveBeenCalledWith('dbgBus.listOpenBreakpoints');
	});

	it('treats an undefined bridge result as a successful call', async () => {
		const configure = vi.fn().mockResolvedValue(undefined);

		await expect(
			callClientMethodWithRetry(
				{configure}
				, 'configure'
				, [{filesAssociations: {'*.inc': 'php'}}]
				, {attempts: 2, delayMs: 0}
			)
		).resolves.toBeUndefined();

		expect(configure).toHaveBeenCalledTimes(1);
	});

	it('does not retry typed errors from configure', async () => {
		const configure = vi.fn().mockRejectedValue(new Error('boom'));

		await expect(
			callClientMethodWithRetry(
				{configure}
				, 'configure'
				, [{filesAssociations: {'*.inc': 'php'}}]
				, {attempts: 2, delayMs: 0}
			)
		).rejects.toThrow('boom');

		expect(configure).toHaveBeenCalledTimes(1);
	});

	it('retries opaque bridge failures until the iframe command surface is ready', async () => {
		const executeDebugCommand = vi.fn()
			.mockRejectedValueOnce({})
			.mockResolvedValueOnce([{location: {uri: 'busfs:/persist/drupal-7.95/index.php'}}]);

		await expect(
			listOpenBreakpointsFor({executeDebugCommand})
		).resolves.toEqual([{location: {uri: 'busfs:/persist/drupal-7.95/index.php'}}]);

		expect(executeDebugCommand).toHaveBeenCalledTimes(2);
	});

	it('retries opaque bridge failures for the direct listOpenBreakpoints bridge', async () => {
		const listOpenBreakpoints = vi.fn()
			.mockRejectedValueOnce({})
			.mockResolvedValueOnce([{location: {uri: 'busfs:/persist/demo.php'}}]);

		await expect(
			listOpenBreakpointsFor({listOpenBreakpoints})
		).resolves.toEqual([{location: {uri: 'busfs:/persist/demo.php'}}]);

		expect(listOpenBreakpoints).toHaveBeenCalledTimes(2);
	});
});
