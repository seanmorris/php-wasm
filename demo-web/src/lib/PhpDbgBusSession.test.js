import { describe, expect, it, vi } from 'vitest';

import { PhpDbgBusSession } from './PhpDbgBusSession';

class FakeRuntime extends EventTarget
{
	constructor()
	{
		super();
		this.run = vi.fn(() => Promise.resolve());
		this.provideInput = vi.fn();
		this.bpCount = vi.fn(() => Promise.resolve(1));
	}
}

const createSession = (id = 'session-1') => ({id});
const createLaunchMessage = (seq = 1, version = '8.3') => ({
	seq
	, command: 'launch'
	, arguments: {
		program: '/persist/demo.php'
		, version
	}
});
const createSetBreakpointsMessage = (seq = 1, lines = [12]) => ({
	seq
	, command: 'setBreakpoints'
	, arguments: {
		source: {
			path: '/persist/demo.php'
		}
		, breakpoints: lines.map(line => ({line}))
	}
});
const createConfigurationDoneMessage = (seq = 1) => ({
	seq
	, command: 'configurationDone'
	, arguments: {}
});

describe('PhpDbgBusSession', () => {
	it('creates a fresh phpdbg runtime for each launch', async () => {
		const runtimes = [];
		const createRuntime = vi.fn(async () => {
			const runtime = new FakeRuntime;
			runtimes.push(runtime);
			return runtime;
		});
		const adapter = new PhpDbgBusSession({createRuntime});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(1));
		await adapter.acceptVSCodeMessage(session, createLaunchMessage(2));

		expect(createRuntime).toHaveBeenCalledTimes(2);
		expect(runtimes).toHaveLength(2);
		expect(runtimes[0]).not.toBe(runtimes[1]);
		expect(runtimes[0].run).toHaveBeenCalledTimes(1);
		expect(runtimes[1].run).toHaveBeenCalledTimes(1);
	});

	it('preserves requested breakpoints while resetting transient session state on restart', async () => {
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => new FakeRuntime)
		});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(1));
		await adapter.acceptVSCodeMessage(session, createSetBreakpointsMessage(2));

		const firstState = adapter.sessionState(session);
		firstState.pendingInput.push('continue');
		firstState.waitingForInput = true;

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(3));

		const restartedState = adapter.sessionState(session);

		expect(restartedState).not.toBe(firstState);
		expect(restartedState.requestedBreakpoints.get('/persist/demo.php')).toEqual([{line: 12}]);
		expect(restartedState.pendingInput).toEqual([]);
		expect(restartedState.waitingForInput).toBe(false);
		expect(restartedState.started).toBe(false);
		expect(restartedState.running).toBe(false);
	});

	it('disposes the runtime when the owning debug session terminates', async () => {
		const createRuntime = vi.fn(async () => new FakeRuntime);
		const adapter = new PhpDbgBusSession({createRuntime});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(1));

		expect(adapter.runtime).not.toBeNull();

		adapter.didTerminateDebugSession(session);

		expect(adapter.runtime).toBeNull();
		expect(adapter.runPromise).toBeNull();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(2));

		expect(createRuntime).toHaveBeenCalledTimes(2);
	});

	it('reapplies stored breakpoints when VS Code starts a new session id', async () => {
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => new FakeRuntime)
		});
		const firstSession = createSession('session-1');
		const secondSession = createSession('session-2');

		await adapter.acceptVSCodeMessage(firstSession, createLaunchMessage(1));
		await adapter.acceptVSCodeMessage(firstSession, createSetBreakpointsMessage(2, [12, 18]));

		adapter.didTerminateDebugSession(firstSession);

		await adapter.acceptVSCodeMessage(secondSession, createLaunchMessage(3));

		expect(adapter.sessionState(secondSession).requestedBreakpoints.get('/persist/demo.php')).toEqual([
			{line: 12}
			, {line: 18}
		]);
	});

	it('only applies breakpoints for files that are open in the current VS Code session', async () => {
		const runtime = new FakeRuntime;
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
			, listOpenBreakpoints: vi.fn(async () => [{
				enabled: true
				, location: {
					uri: 'busfs:///persist/drupal-7.95/index.php'
					, line: 17
					, column: 1
				}
			}])
		});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, {
			seq: 1
			, command: 'launch'
			, arguments: {
				program: '/persist/drupal-7.95/index.php'
				, version: '8.3'
				, stopOnEntry: true
			}
		});
		await adapter.acceptVSCodeMessage(session, {
			seq: 2
			, command: 'setBreakpoints'
			, arguments: {
				source: {
					path: '/persist/laravel-11/public/index.php'
				}
				, breakpoints: [{line: 11}]
			}
		});
		await adapter.acceptVSCodeMessage(session, {
			seq: 3
			, command: 'setBreakpoints'
			, arguments: {
				source: {
					path: '/persist/drupal-7.95/index.php'
				}
				, breakpoints: [{line: 17}]
			}
		});
		await adapter.acceptVSCodeMessage(session, createConfigurationDoneMessage(4));

		const commands = runtime.provideInput.mock.calls.map(([command]) => command);

		expect(commands).toContain('exec /persist/drupal-7.95/index.php');
		expect(commands).toContain('b /persist/drupal-7.95/index.php:17');
		expect(commands).not.toContain('b /persist/laravel-11/public/index.php:11');
	});
});
