/**
 * VS Code debug adapter shim for php-dbg-wasm.
 */
import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';

const DEFAULT_THREAD_ID = 1;

/**
 * Extracts the final path segment for a runtime file.
 */
const basename = path => String(path ?? '').split('/').pop() || String(path ?? '');

/**
 * Converts runtime paths into the busfs scheme understood by the VS Code iframe.
 */
const toEditorPath = path => {
	const normalized = normalizePath(path);

	if(!normalized)
	{
		return normalized;
	}

	if(normalized.startsWith('busfs:'))
	{
		return normalized;
	}

	const runtimePath = normalized.startsWith('/') ? normalized : `/${normalized}`;
	return `busfs://${runtimePath}`;
};

/**
 * Normalizes file paths coming from URLs, runtime output, and VS Code requests.
 */
const normalizePath = path => {
	if(!path)
	{
		return path;
	}

	const stringPath = String(path);

	if(/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(stringPath))
	{
		try
		{
			return new URL(stringPath).pathname || '/';
		}
		catch
		{}
	}

	return stringPath;
};

/**
 * Default no-op callback used until a debug message sink is attached.
 */
const noop = () => {};

/**
 * Headless phpdbg-wasm session adapter that translates VS Code DAP traffic
 * into PhpDbgWeb commands and state queries.
 */
export class PhpDbgBusSession
{
	constructor({
		createRuntime = args => new PhpDbgWeb(args)
		, runtimeArgs = {}
		, fs = {}
		, listOpenBreakpoints = null
		, postMessage = noop
	} = {}) {
		this.createRuntime = createRuntime;
		this.defaultRuntimeArgs = runtimeArgs;
		this.runtimeArgs = runtimeArgs;
		this.fs = fs;
		this.listOpenBreakpoints = listOpenBreakpoints;
		this.postMessage = postMessage;

		this.runtime = null;
		this.runPromise = null;
		this.listenersAttached = false;

		this.seq = 1;
		this.nextVariableReference = 1;
		this.variableReferences = new Map;
		this.resumeCommands = new Map([
			['run', 'breakpoint']
			, ['continue', 'breakpoint']
			, ['step', 'step']
			, ['next', 'step']
			, ['finish', 'step']
			, ['until', 'step']
			, ['leave', 'step']
		]);

		this.sessions = new Map;
		this.activeSessionId = null;
		this.requestedBreakpoints = new Map;

		this.handleStdinRequest = this.handleStdinRequest.bind(this);
		this.handleOutput = this.handleOutput.bind(this);
		this.handleError = this.handleError.bind(this);
	}

	/**
	 * Replaces the outbound message sink used to emit DAP responses and events.
	 */
	setMessageSink(postMessage = noop)
	{
		this.postMessage = postMessage;
	}

	/**
	 * Lazily creates the phpdbg runtime and attaches the output listeners once.
	 */
	async getRuntime()
	{
		if(this.runtime)
		{
			return this.runtime;
		}

		this.runtime = await this.createRuntime(this.runtimeArgs);

		if(!this.listenersAttached)
		{
			this.runtime.addEventListener('stdin-request', this.handleStdinRequest);
			this.runtime.addEventListener('output', this.handleOutput);
			this.runtime.addEventListener('error', this.handleError);
			this.listenersAttached = true;
		}

		if(!this.runPromise)
		{
			this.runPromise = this.runtime.run();
		}

		return this.runtime;
	}

	/**
	 * Detaches listeners and clears the active runtime instance.
	 */
	disposeRuntime()
	{
		if(this.runtime && this.listenersAttached)
		{
			this.runtime.removeEventListener('stdin-request', this.handleStdinRequest);
			this.runtime.removeEventListener('output', this.handleOutput);
			this.runtime.removeEventListener('error', this.handleError);
		}

		this.listenersAttached = false;
		this.runtime = null;
		this.runPromise = null;
	}

	/**
	 * Resets the adapter state across every session and variable reference.
	 */
	dispose()
	{
		this.disposeRuntime();
		this.sessions.clear();
		this.variableReferences.clear();
		this.activeSessionId = null;
		this.requestedBreakpoints.clear();
	}

	/**
	 * Applies launch-time runtime settings and recreates the runtime when versions change.
	 */
	configureRuntime(config = {})
	{
		const nextVersion = config.version ?? this.defaultRuntimeArgs.version;
		const currentVersion = this.runtimeArgs?.version ?? this.defaultRuntimeArgs.version;

		if(nextVersion !== currentVersion)
		{
			this.disposeRuntime();
		}

		this.runtimeArgs = {
			...this.defaultRuntimeArgs
			, ...(nextVersion ? {version: nextVersion} : {})
		};
	}

	/**
	 * Creates the tracked state object for one VS Code debug session.
	 */
	createSessionState(session, overrides = {})
	{
		return {
			session
			, frameMap: new Map
			, breakpoints: new Map
			, config: null
			, lastResumeReason: 'breakpoint'
			, running: false
			, started: false
			, initializing: false
			, requestedBreakpoints: new Map(this.requestedBreakpoints)
			, pendingInput: []
			, waitingForInput: false
			, ...overrides
		};
	}

	/**
	 * Replaces the stored session state object and returns the new state.
	 */
	resetSessionState(session, overrides = {})
	{
		const state = this.createSessionState(session, overrides);
		this.sessions.set(session.id, state);
		return state;
	}

	/**
	 * Starts a new debug session, resets runtime state, and boots phpdbg.
	 */
	async startDebugSession(session, config = {}, overrides = {})
	{
		this.disposeRuntime();
		this.clearVariableReferences();

		const state = this.resetSessionState(session, {
			config
			, ...overrides
		});

		this.activeSessionId = session.id;
		this.configureRuntime(config);
		await this.getRuntime();

		return state;
	}

	/**
	 * Ends a debug session and tears down the shared runtime when appropriate.
	 */
	endDebugSession(sessionId)
	{
		const wasActiveSession = this.activeSessionId === sessionId;

		this.sessions.delete(sessionId);

		if(wasActiveSession)
		{
			this.activeSessionId = null;
			this.disposeRuntime();
			this.clearVariableReferences();
			return;
		}

		if(!this.sessions.size)
		{
			this.disposeRuntime();
			this.clearVariableReferences();
		}
	}

	/**
	 * Returns the tracked state for a session, creating it on first access.
	 */
	sessionState(session)
	{
		if(!this.sessions.has(session.id))
		{
			this.sessions.set(session.id, this.createSessionState(session));
		}

		const state = this.sessions.get(session.id);
		state.session = session;

		return state;
	}

	/**
	 * Sends a raw DAP message through the configured VS Code bridge.
	 */
	send(sessionId, message)
	{
		return this.postMessage(sessionId, {
			seq: this.seq++,
			...message
		});
	}

	/**
	 * Sends a DAP event envelope to the VS Code bridge.
	 */
	sendEvent(sessionId, event, body = {})
	{
		return this.send(sessionId, {
			type: 'event'
			, event
			, body
		});
	}

	/**
	 * Builds a DAP response object for the provided request.
	 */
	response(request, body = {}, success = true, message = undefined)
	{
		return {
			type: 'response'
			, request_seq: request.seq
			, command: request.command
			, success
			, message
			, body
		};
	}

	/**
	 * Sends a single command line to the phpdbg runtime.
	 */
	async command(line)
	{
		const runtime = await this.getRuntime();
		return runtime.provideInput(line);
	}

	/**
	 * Clears tracked variable handles before a new stack inspection.
	 */
	clearVariableReferences()
	{
		this.variableReferences.clear();
		this.nextVariableReference = 1;
	}

	makeScopeReference(loader)
	{
		const reference = this.nextVariableReference++;
		this.variableReferences.set(reference, loader);
		return reference;
	}

	async resolveVariables(reference)
	{
		const loader = this.variableReferences.get(reference);

		if(!loader)
		{
			return [];
		}

		const value = await loader();
		return this.serializeVariables(value);
	}

	serializeVariables(values = {})
	{
		return Object.entries(values).map(([name, value]) => this.serializeVariable(name, value));
	}

	serializeVariable(name, value)
	{
		if(value && typeof value === 'object')
		{
			const variableReference = this.makeScopeReference(() => value);

			return {
				name
				, value: Array.isArray(value) ? `Array(${value.length})` : 'Object'
				, type: Array.isArray(value) ? 'array' : 'object'
				, variablesReference: variableReference
			};
		}

		return {
			name
			, value: String(value)
			, type: typeof value
			, variablesReference: 0
		};
	}

	/**
	 * Replaces the runtime breakpoints registered for a single source path.
	 */
	async setSourceBreakpoints(state, path, breakpoints = [])
	{
		const runtime = await this.getRuntime();
		const existing = state.breakpoints.get(path) ?? new Map;

		for(const [, id] of existing)
		{
			await this.command(`b ~ ${id}`);
		}

		const next = new Map;

		for(const breakpoint of breakpoints)
		{
			await this.command(`b ${path}:${breakpoint.line}`);
			const id = await runtime.bpCount();
			next.set(breakpoint.line, id);
		}

		state.breakpoints.set(path, next);

		return breakpoints.map(breakpoint => ({
			id: next.get(breakpoint.line)
			, verified: true
			, line: breakpoint.line
			, column: breakpoint.column ?? 1
		}));
	}

	formatRequestedBreakpoints(breakpoints = [])
	{
		return breakpoints.map(breakpoint => ({
			verified: true
			, line: breakpoint.line
			, column: breakpoint.column ?? 1
		}));
	}

	buildRequestedBreakpointMap(breakpoints = [])
	{
		const requestedBreakpoints = new Map;

		for(const breakpoint of breakpoints)
		{
			if(!breakpoint?.enabled || !breakpoint.location?.uri || !breakpoint.location?.line)
			{
				continue;
			}

			const path = normalizePath(breakpoint.location.uri);

			if(!path)
			{
				continue;
			}

			const nextBreakpoints = requestedBreakpoints.get(path) ?? [];
			nextBreakpoints.push({
				line: breakpoint.location.line
				, column: breakpoint.location.column ?? 1
			});
			requestedBreakpoints.set(path, nextBreakpoints);
		}

		return requestedBreakpoints;
	}

	/**
	 * Pulls the currently open breakpoints from the VS Code bridge into session state.
	 */
	async syncRequestedBreakpointsFromOpenFiles(state)
	{
		if(!this.listOpenBreakpoints)
		{
			return false;
		}

		try
		{
			const requestedBreakpoints = this.buildRequestedBreakpointMap(
				await this.listOpenBreakpoints()
			);

			state.requestedBreakpoints = requestedBreakpoints;
			this.requestedBreakpoints = new Map(requestedBreakpoints);

			return true;
		}
		catch(error)
		{
			console.warn('[PhpDbgBusSession] Failed to sync open breakpoints', error);
			return false;
		}
	}

	async applyRequestedBreakpoints(state)
	{
		for(const [path, breakpoints] of state.requestedBreakpoints.entries())
		{
			await this.setSourceBreakpoints(state, path, breakpoints);
		}
	}

	/**
	 * Builds DAP stack frames from the current phpdbg backtrace.
	 */
	async stackFrames(state)
	{
		const runtime = await this.getRuntime();
		const backtrace = await runtime.dumpBacktrace() ?? [];
		const currentFile = await runtime.currentFile();
		const currentLine = await runtime.currentLine();

		const frames = backtrace.length
			? backtrace
			: (currentFile ? [{filename: currentFile, lineNo: currentLine || 1, frame: 0}] : []);

		state.frameMap.clear();

		return frames.map((frame, index) => {
			const id = index + 1;
			state.frameMap.set(id, frame.frame ?? index);

			return {
				id
				, name: basename(frame.filename) || `frame ${index}`
				, line: frame.lineNo || 1
				, column: 1
				, source: {
					name: basename(frame.filename)
					, path: toEditorPath(frame.filename)
				}
			};
		});
	}

	/**
	 * Returns the DAP scopes exposed for a frame.
	 */
	async scopes(state, frameId)
	{
		const runtime = await this.getRuntime();
		await this.switchFrame(state, frameId, runtime);

		return [
			{
				name: 'Locals'
				, presentationHint: 'locals'
				, expensive: false
				, variablesReference: this.makeScopeReference(() => runtime.dumpVars() || {})
			}
			, {
				name: 'Globals'
				, presentationHint: 'globals'
				, expensive: false
				, variablesReference: this.makeScopeReference(() => runtime.dumpGlobals() || {})
			}
			, {
				name: 'Constants'
				, expensive: false
				, variablesReference: this.makeScopeReference(() => runtime.dumpConstants() || {})
			}
		];
	}

	async switchFrame(state, frameId, runtime = null)
	{
		const activeRuntime = runtime || await this.getRuntime();
		const phpFrame = state.frameMap.get(frameId) ?? 0;
		await activeRuntime.switchFrame(phpFrame);
		return activeRuntime;
	}

	/**
	 * Handles the DAP initialize request and advertises adapter capabilities.
	 */
	async handleInitialize(session, message)
	{
		const state = this.sessionState(session);
		state.initializing = true;

		queueMicrotask(() => {
			this.sendEvent(session.id, 'initialized');
		});

		return this.response(message, {
			supportsConfigurationDoneRequest: true
			, supportsSetVariable: false
			, supportsConditionalBreakpoints: false
			, supportsFunctionBreakpoints: false
			, supportsEvaluateForHovers: true
			, supportsRestartRequest: false
			, supportsStepBack: false
			, supportTerminateDebuggee: true
			, supportsTerminateRequest: true
		});
	}

	async handleLaunch(session, message)
	{
		await this.startDebugSession(session, message.arguments ?? {}, {
			lastResumeReason: 'entry'
		});

		return this.response(message);
	}

	async handleAttach(session, message)
	{
		await this.startDebugSession(session, message.arguments ?? {}, {
			lastResumeReason: 'breakpoint'
		});

		return this.response(message);
	}

	/**
	 * Finishes session bootstrap, installs breakpoints, and optionally runs the program.
	 */
	async handleConfigurationDone(session, message)
	{
		const state = this.sessionState(session);
		const config = state.config ?? {};
		const program = normalizePath(config.program ?? this.runtimeArgs.program);
		const initCommands = this.normalizeInitCommands(config.initCommands);
		let resumedDuringInit = false;

		if(program)
		{
			await this.command(`exec ${program}`);
		}

		// Mirror the old demo debugger setup so phpdbg doesn't try to paginate
		// or otherwise fall back to interactive TTY-style prompt behavior.
		await this.command('set pagination off');

		await this.syncRequestedBreakpointsFromOpenFiles(state);
		await this.applyRequestedBreakpoints(state);

		for(const command of initCommands)
		{
			const resumeReason = this.isResumeCommand(command);

			if(resumeReason && !resumedDuringInit)
			{
				resumedDuringInit = true;
				state.running = true;
				state.lastResumeReason = resumeReason;

				await this.sendEvent(session.id, 'continued', {
					threadId: DEFAULT_THREAD_ID
					, allThreadsContinued: true
				});
			}

			await this.command(command);
		}

		state.started = true;
		state.lastResumeReason = resumedDuringInit
			? state.lastResumeReason
			: (config.stopOnEntry ? 'entry' : 'breakpoint');
		state.running = resumedDuringInit || !config.stopOnEntry;

		if(resumedDuringInit)
		{
			return this.response(message);
		}

		if(config.stopOnEntry)
		{
			await this.sendEvent(session.id, 'stopped', {
				reason: 'entry'
				, threadId: DEFAULT_THREAD_ID
				, allThreadsStopped: true
				, description: program ? `${program}:1` : 'Paused on entry'
			});
		}
		else
		{
			await this.sendEvent(session.id, 'continued', {
				threadId: DEFAULT_THREAD_ID
				, allThreadsContinued: true
			});
			await this.command('run');
		}

		return this.response(message);
	}

	/**
	 * Synchronizes breakpoints for a single source file.
	 */
	async handleSetBreakpoints(session, message)
	{
		const state = this.sessionState(session);
		const path = normalizePath(message.arguments?.source?.path);
		const breakpoints = message.arguments?.breakpoints ?? [];

		console.debug('[PhpDbgBusSession] setBreakpoints', JSON.stringify({
			path
			, breakpoints
		}));

		state.requestedBreakpoints.set(path, breakpoints);
		this.requestedBreakpoints.set(path, breakpoints);

		if(!path)
		{
			return this.response(message, {breakpoints: []});
		}

		if(!state.started)
		{
			return this.response(message, {
				breakpoints: this.formatRequestedBreakpoints(breakpoints)
			});
		}

		const dapBreakpoints = await this.setSourceBreakpoints(state, path, breakpoints);

		return this.response(message, {breakpoints: dapBreakpoints});
	}

	/**
	 * Returns source text for the requested file when the backing filesystem exposes it.
	 */
	async handleSource(message)
	{
		const path = normalizePath(
			message.arguments?.source?.path
			?? message.arguments?.path
		);

		if(!path || !this.fs.readFile)
		{
			return this.response(message, {}, false, 'Source is unavailable');
		}

		const bytes = await this.fs.readFile(path);
		const content = new TextDecoder().decode(bytes);

		return this.response(message, {
			content
			, mimeType: 'text/x-php'
		});
	}

	async handleThreads(message)
	{
		return this.response(message, {
			threads: [{id: DEFAULT_THREAD_ID, name: 'Main Thread'}]
		});
	}

	async handleStackTrace(session, message)
	{
		const state = this.sessionState(session);
		this.clearVariableReferences();

		const stackFrames = await this.stackFrames(state);

		return this.response(message, {
			stackFrames
			, totalFrames: stackFrames.length
		});
	}

	async handleScopes(session, message)
	{
		const state = this.sessionState(session);
		const scopes = await this.scopes(state, message.arguments?.frameId);

		return this.response(message, {scopes});
	}

	async handleVariables(message)
	{
		const variables = await this.resolveVariables(message.arguments?.variablesReference);
		return this.response(message, {variables});
	}

	/**
	 * Continues execution using the requested phpdbg resume command.
	 */
	async handleContinue(session, message, command, reason)
	{
		const state = this.sessionState(session);
		state.lastResumeReason = reason;
		state.running = true;
		state.waitingForInput = false;

		await this.sendEvent(session.id, 'continued', {
			threadId: DEFAULT_THREAD_ID
			, allThreadsContinued: true
		});

		await this.command(command);

		return this.response(message, {
			allThreadsContinued: true
		});
	}

	async enqueueTerminalInput(session, input)
	{
		const state = this.sessionState(session);
		const line = String(input ?? '');
		state.pendingInput.push(line);

		if(state.waitingForInput)
		{
			await this.consumePendingInput(session, state);
		}
	}

	/**
	 * Detects whether a user command resumes program execution.
	 */
	isResumeCommand(input)
	{
		const command = String(input ?? '').trim().split(/\s+/, 1)[0].toLowerCase();
		return this.resumeCommands.get(command) ?? null;
	}

	normalizeInitCommands(commands = [])
	{
		if(!Array.isArray(commands))
		{
			return [];
		}

		return commands
			.map(command => String(command ?? '').trim())
			.filter(Boolean);
	}

	/**
	 * Converts simple `$variable` expressions into names that match dumpVars output.
	 */
	normalizeLookupExpression(expression)
	{
		const normalized = String(expression ?? '').trim();

		if(/^\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(normalized))
		{
			return normalized.slice(1);
		}

		return normalized;
	}

	async consumePendingInput(session, state)
	{
		if(!state.waitingForInput || !state.pendingInput.length)
		{
			return false;
		}

		const input = state.pendingInput.shift();
		const resumeReason = this.isResumeCommand(input);
		state.waitingForInput = false;

		if(resumeReason)
		{
			state.lastResumeReason = resumeReason;
			state.running = true;

			await this.sendEvent(session.id, 'continued', {
				threadId: DEFAULT_THREAD_ID
				, allThreadsContinued: true
			});
		}

		await this.command(input);
		return true;
	}

	/**
	 * Handles REPL and watch-expression evaluation requests from VS Code.
	 */
	async handleEvaluate(session, message)
	{
		if(message.arguments?.context === 'repl')
		{
			await this.enqueueTerminalInput(session, message.arguments?.expression ?? '');

			return this.response(message, {
				result: ''
				, type: 'string'
				, variablesReference: 0
			});
		}

		const state = this.sessionState(session);
		const runtime = await this.getRuntime();
		await this.switchFrame(state, message.arguments?.frameId, runtime);
		const expression = message.arguments?.expression ?? '';
		const lookupExpression = this.normalizeLookupExpression(expression);
		const locals = await runtime.dumpVars() || {};
		const globals = await runtime.dumpGlobals() || {};
		const constants = await runtime.dumpConstants() || {};

		const value = expression in locals
			? locals[expression]
			: lookupExpression in locals
				? locals[lookupExpression]
				: expression in globals
					? globals[expression]
					: lookupExpression in globals
						? globals[lookupExpression]
						: expression in constants
							? constants[expression]
							: constants[lookupExpression];

		const serialized = this.serializeVariable(expression, value);

		return this.response(message, {
			result: serialized.value
			, type: serialized.type
			, variablesReference: serialized.variablesReference
		});
	}

	async handleDisconnect(session, message)
	{
		await this.sendEvent(session.id, 'terminated', {});
		this.endDebugSession(session.id);

		return this.response(message);
	}

	/**
	 * Dispatches inbound VS Code adapter messages to the matching handler.
	 */
	async acceptVSCodeMessage(session, message)
	{
		switch(message.command)
		{
			case 'initialize':
				return this.handleInitialize(session, message);

			case 'launch':
				return this.handleLaunch(session, message);

			case 'attach':
				return this.handleAttach(session, message);

			case 'configurationDone':
				return this.handleConfigurationDone(session, message);

			case 'setBreakpoints':
				return this.handleSetBreakpoints(session, message);

			case 'source':
				return this.handleSource(message);

			case 'setExceptionBreakpoints':
				return this.response(message, {breakpoints: []});

			case 'threads':
				return this.handleThreads(message);

			case 'stackTrace':
				return this.handleStackTrace(session, message);

			case 'scopes':
				return this.handleScopes(session, message);

			case 'variables':
				return this.handleVariables(message);

			case 'continue':
				return this.handleContinue(session, message, 'continue', 'breakpoint');

			case 'next':
				return this.handleContinue(session, message, 'next', 'step');

			case 'stepIn':
				return this.handleContinue(session, message, 'step', 'step');

			case 'stepOut':
				return this.handleContinue(session, message, 'finish', 'step');

			case 'pause':
				return this.response(message, {}, false, 'pause is not supported by phpdbg-wasm');

			case 'evaluate':
				return this.handleEvaluate(session, message);

			case 'disconnect':
			case 'terminate':
				return this.handleDisconnect(session, message);

			default:
				return this.response(message, {}, false, `Unsupported command: ${message.command}`);
		}
	}

	debugSessionStarted(session)
	{
		this.sessionState(session);
		this.activeSessionId = session.id;
		return true;
	}

	didStartDebugSession(session)
	{
		this.sessionState(session);
		this.activeSessionId = session.id;
		return true;
	}

	didTerminateDebugSession(session)
	{
		this.endDebugSession(session.id);

		return true;
	}

	/**
	 * Updates the session id used for forwarding stdout, stderr, and stop events.
	 */
	didChangeActiveDebugSession(session)
	{
		this.activeSessionId = session?.id ?? null;
		return true;
	}

	/**
	 * Reacts to phpdbg stdin requests and converts them into stop or terminate events.
	 */
	async handleStdinRequest()
	{
		if(!this.activeSessionId || !this.sessions.has(this.activeSessionId))
		{
			return;
		}

		const session = this.sessions.get(this.activeSessionId);
		session.waitingForInput = true;

		if(await this.consumePendingInput(session.session, session))
		{
			return;
		}

		if(session.started && session.running)
		{
			const runtime = await this.getRuntime();
			const isRunning = await runtime.isRunning();

			if(!isRunning)
			{
				session.running = false;
				session.waitingForInput = false;
				await this.sendEvent(this.activeSessionId, 'terminated', {});
				return;
			}

			const file = await runtime.currentFile();
			const line = await runtime.currentLine();
			session.running = false;
			await this.sendEvent(this.activeSessionId, 'stopped', {
				reason: session.lastResumeReason
				, threadId: DEFAULT_THREAD_ID
				, allThreadsStopped: true
				, description: file ? `${file}:${line}` : undefined
			});
		}
	}

	/**
	 * Forwards phpdbg stdout lines into VS Code output events.
	 */
	handleOutput(event)
	{
		if(!this.activeSessionId)
		{
			return;
		}

		for(const line of event.detail ?? [])
		{
			this.sendEvent(this.activeSessionId, 'output', {
				category: 'stdout'
				, output: line
			});
		}
	}

	/**
	 * Forwards phpdbg stderr lines into VS Code output events.
	 */
	handleError(event)
	{
		if(!this.activeSessionId)
		{
			return;
		}

		for(const line of event.detail ?? [])
		{
			this.sendEvent(this.activeSessionId, 'output', {
				category: 'stderr'
				, output: line
			});
		}
	}
}

export default PhpDbgBusSession;
