import { describe, expect, it, vi } from 'vitest';

import { PhpDbgBusSession } from './PhpDbgBusSession';

class FakeRuntime extends EventTarget
{
	constructor()
	{
		super();
		this.run = vi.fn(() => Promise.resolve());
		this.provideInput = vi.fn();
		this.isRunning = vi.fn(() => Promise.resolve(1));
		this.bpCount = vi.fn(() => Promise.resolve(1));
		this.dumpBacktrace = vi.fn(() => Promise.resolve([]));
		this.currentFile = vi.fn(() => Promise.resolve('/persist/demo.php'));
		this.currentLine = vi.fn(() => Promise.resolve(12));
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
const createStackTraceMessage = (seq = 1) => ({
	seq
	, command: 'stackTrace'
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

	it('returns busfs workspace paths for stack frames', async () => {
		const runtime = new FakeRuntime;
		runtime.dumpBacktrace.mockResolvedValue([{
			filename: 'busfs:/persist/drupal-7.95/index.php'
			, lineNo: 17
			, frame: 0
		}]);
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
		});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(1));

		const response = await adapter.acceptVSCodeMessage(session, createStackTraceMessage(2));

		expect(response.body.stackFrames).toEqual([{
			id: 1
			, name: 'index.php'
			, line: 17
			, column: 1
			, source: {
				name: 'index.php'
				, path: 'busfs:/persist/drupal-7.95/index.php'
			}
		}]);
	});

	it('falls back to the current debugger location when the top backtrace frame is blank', async () => {
		const runtime = new FakeRuntime;
		runtime.dumpBacktrace.mockResolvedValue([{
			filename: ''
			, lineNo: 0
			, frame: 0
		}]);
		runtime.currentFile.mockResolvedValue('/persist/drupal-7.95/index.php');
		runtime.currentLine.mockResolvedValue(17);
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
		});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(1));

		const response = await adapter.acceptVSCodeMessage(session, createStackTraceMessage(2));

		expect(response.body.stackFrames[0]).toEqual({
			id: 1
			, name: 'index.php'
			, line: 17
			, column: 1
			, source: {
				name: 'index.php'
				, path: 'busfs:/persist/drupal-7.95/index.php'
			}
		});
	});

	it('falls back to the current debugger location when the top backtrace frame uses the no-active-file placeholder', async () => {
		const runtime = new FakeRuntime;
		runtime.dumpBacktrace.mockResolvedValue([{
			filename: '[no active file]'
			, lineNo: 1
			, frame: 0
		}]);
		runtime.currentFile.mockResolvedValue('/persist/drupal-7.95/index.php');
		runtime.currentLine.mockResolvedValue(17);
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
		});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, createLaunchMessage(1));

		const response = await adapter.acceptVSCodeMessage(session, createStackTraceMessage(2));

		expect(response.body.stackFrames[0]).toEqual({
			id: 1
			, name: 'index.php'
			, line: 17
			, column: 1
			, source: {
				name: 'index.php'
				, path: 'busfs:/persist/drupal-7.95/index.php'
			}
		});
	});

	it('falls back to the runtime program when the launch config program is not a runtime path', async () => {
		const runtime = new FakeRuntime;
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
			, runtimeArgs: {
				version: '8.3'
				, program: '/persist/drupal-7.95/index.php'
			}
		});
		const session = createSession();

		await adapter.acceptVSCodeMessage(session, {
			seq: 1
			, command: 'launch'
			, arguments: {
				program: '[no active file]'
				, version: '8.3'
				, stopOnEntry: true
			}
		});
		await adapter.acceptVSCodeMessage(session, createConfigurationDoneMessage(2));

		const commands = runtime.provideInput.mock.calls.map(([command]) => command);

		expect(commands).toContain('exec /persist/drupal-7.95/index.php');
		expect(commands).not.toContain('exec [no active file]');
	});

	it('keeps the debug session alive when phpdbg pauses at a breakpoint prompt', async () => {
		const runtime = new FakeRuntime;
		const postMessage = vi.fn();
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
			, postMessage
		});
		const session = createSession();
		const state = adapter.resetSessionState(session, {
			started: true
			, running: true
		});

		adapter.runtime = runtime;
		adapter.activeSessionId = session.id;

		await adapter.handleStdinRequest();

		const events = postMessage.mock.calls
			.map(([, message]) => message)
			.filter(message => message.type === 'event');

		expect(events.some(message => message.event === 'stopped')).toBe(true);
		expect(events.some(message => message.event === 'terminated')).toBe(false);
		expect(state.waitingForInput).toBe(true);
	});

	it('terminates the debug session when phpdbg reports that the script ended', async () => {
		const runtime = new FakeRuntime;
		runtime.isRunning.mockResolvedValue(0);
		runtime.currentFile.mockResolvedValue('');
		const postMessage = vi.fn();
		const adapter = new PhpDbgBusSession({
			createRuntime: vi.fn(async () => runtime)
			, postMessage
		});
		const session = createSession();
		const state = adapter.resetSessionState(session, {
			started: true
			, running: true
		});

		adapter.runtime = runtime;
		adapter.activeSessionId = session.id;

		await adapter.handleStdinRequest();

		const events = postMessage.mock.calls
			.map(([, message]) => message)
			.filter(message => message.type === 'event');

		expect(events.some(message => message.event === 'terminated')).toBe(true);
		expect(state.waitingForInput).toBe(false);
	});
});
