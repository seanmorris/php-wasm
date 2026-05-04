import { PhpDbgWeb } from 'php-dbg-wasm/PhpDbgWeb';

const DEFAULT_THREAD_ID = 1;

const basename = path => String(path ?? '').split('/').pop() || String(path ?? '');
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

	setMessageSink(postMessage = noop)
	{
		this.postMessage = postMessage;
	}

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

	dispose()
	{
		this.disposeRuntime();
		this.sessions.clear();
		this.variableReferences.clear();
		this.activeSessionId = null;
		this.requestedBreakpoints.clear();
	}

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

	resetSessionState(session, overrides = {})
	{
		const state = this.createSessionState(session, overrides);
		this.sessions.set(session.id, state);
		return state;
	}

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

	send(sessionId, message)
	{
		return this.postMessage(sessionId, {
			seq: this.seq++,
			...message
		});
	}

	sendEvent(sessionId, event, body = {})
	{
		return this.send(sessionId, {
			type: 'event'
			, event
			, body
		});
	}

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

	async command(line)
	{
		const runtime = await this.getRuntime();
		return runtime.provideInput(line);
	}

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

	didChangeActiveDebugSession(session)
	{
		this.activeSessionId = session?.id ?? null;
		return true;
	}

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

		const runtime = await this.getRuntime();
		let isExecuting = !!(await runtime.isExecuting());
		let file = await runtime.currentFile();
		let line = await runtime.currentLine();

		if(!isExecuting && session.started && session.running)
		{
			await new Promise(resolve => setTimeout(resolve, 0));
			isExecuting = !!(await runtime.isExecuting());
			file = await runtime.currentFile();
			line = await runtime.currentLine();
		}
		if(isExecuting)
		{
			session.running = false;
			await this.sendEvent(this.activeSessionId, 'stopped', {
				reason: session.lastResumeReason
				, threadId: DEFAULT_THREAD_ID
				, allThreadsStopped: true
				, description: file ? `${file}:${line}` : undefined
			});
		}
		else if(session.started && session.running)
		{
			session.running = false;
			session.waitingForInput = false;
			await this.sendEvent(this.activeSessionId, 'terminated', {});
		}
	}

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
