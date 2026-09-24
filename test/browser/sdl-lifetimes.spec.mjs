import {test, expect} from '@playwright/test';
import {start, run, rejectHelper} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const setup = String.raw`
SDL_Init(SDL_INIT_VIDEO);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
$window = new SDL_Window('Lifetimes',0,0,64,64,SDL_WINDOW_OPENGL);
`;

/**
 * Observe browser allocations directly, including allocations made inside SDL.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<void>} Resolves after instrumentation is registered.
 */
const watchGpu = page => page.addInitScript(() => {
	window.gpuObjects = {};
	for(const kind of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'VertexArray', 'Shader', 'Program'])
	{
		const record = window.gpuObjects[kind] = {live: new Set, created: 0, deleted: 0};
		for(const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype])
		{
			for(const operation of ['create', 'delete'])
			{
				const name = operation + kind;
				if(!Object.hasOwn(prototype, name))
				{
					continue;
				}
				const original = prototype[name];
				prototype[name] = function(...args) {
					const result = Reflect.apply(original, this, args);
					if(operation === 'create' && result)
					{
						record.live.add(result);
						record.created++;
					}
					else if(operation === 'delete' && record.live.delete(args[0]))
					{
						record.deleted++;
					}
					return result;
				};
			}
		}
	}
});

/**
 * Read browser object counts after PHP has finished a teardown path.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<object>} Counts grouped by GL object type.
 */
const gpuCounts = page => page.evaluate(() => Object.fromEntries(
	Object.entries(window.gpuObjects).map(([kind, {live, created, deleted}]) => [kind, {live: live.size, created, deleted}])
));

test('GL constructors, method aliases and owner destruction invalidate borrowed contexts', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	class ContextSubclass extends SDL_GLContext {}
	$context = new ContextSubclass($window);
	$created = SDL_GL_MakeCurrent($window,$context);
	$text = (string)$context;
	$alias = SDL_GL_GetCurrentContext();
	$reject('clone',function() use ($context) { $copy = clone $context; });
	$reject('serialize',function() use ($context) { serialize($context); });
	$reject('reinitialize',function() use ($context,$window) { $context->__construct($window); });
	$reject('second-context',function() use ($window) { SDL_GL_CreateContext($window); });
	$reject('renderer-overlap',function() use ($window) { SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED); });
	$unbound = SDL_GL_MakeCurrent(null,null);
	$noCurrent = SDL_GL_GetCurrentContext() === null;
	$reject('second-while-unbound',function() use ($window) { new SDL_GLContext($window); });
	$rebound = $window->GL_MakeCurrent($context);
	class ContextUser {
		function bind($window,$context) { return SDL_GL_MakeCurrent($window,$context); }
	}
	$proceduralFromMethod = (new ContextUser)->bind($window,$context);
	$window->GL_GetDrawableSize($width,$height);
	class TypedOutputs { public int $number = 7; public array $wrong = []; }
	$outputs = new TypedOutputs;
	$reject('drawable-type',function() use ($window,$outputs) { SDL_GL_GetDrawableSize($window,$outputs->wrong,$height); });
	$reject('attribute-type',function() use ($outputs) { SDL_GL_GetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,$outputs->wrong); });
	SDL_GL_GetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,$outputs->number);
	$major = $outputs->number;
	$alias->Delete();
	$deleted = [(string)$context,(string)$alias,SDL_GL_GetCurrentContext()];
	$context->Delete(); $alias->Delete();
	$reject('deleted-alias',function() use ($window,$alias) { SDL_GL_MakeCurrent($window,$alias); });
	$context = SDL_GL_CreateContext($window);
	$alias = SDL_GL_GetCurrentContext();
	unset($context);
	$afterOwner = [(string)$alias,SDL_GL_GetCurrentContext()];
	$reject('owner-gone',function() use ($window,$alias) { SDL_GL_MakeCurrent($window,$alias); });
	$reject('no-context',function() { glGetString(GL_VERSION); });
	$context = $window->GL_CreateContext();
	$method = $window->GL_MakeCurrent($context);
	$window->GL_MakeCurrent(null);
	$context->Delete();
	SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('created','text','unbound','noCurrent','rebound','proceduralFromMethod','width','height','major','deleted','afterOwner','method','rejected'));
	`);
	expect(result.text).toMatch(/^SDL_GLContext\([0-9a-f]+\)$/);
	expect(result).toMatchObject({created: 0, unbound: 0, noCurrent: true, rebound: 0, proceduralFromMethod: 0, width: 64, height: 64, major: 3, method: 0});
	expect(result.deleted).toEqual(['SDL_GLContext()', 'SDL_GLContext()', null]);
	expect(result.afterOwner).toEqual(['SDL_GLContext()', null]);
	expect(result.rejected).toEqual([
		'clone', 'serialize', 'reinitialize', 'second-context', 'renderer-overlap', 'second-while-unbound'
		, 'drawable-type', 'attribute-type', 'deleted-alias', 'owner-gone', 'no-context'
	]);
});

test('window and video teardown delete every PHP GL object and allow a new context', async ({page}) => {
	await watchGpu(page);
	await start(page);
	for(const teardown of ['window', 'window-owner', 'quit', 'video-quit', 'video-init', 'subsystem'])
	{
		const result = await run(page, String.raw`${setup}${rejectHelper}
		$context = new SDL_GLContext($window);
		$alias = SDL_GL_GetCurrentContext();
		glGenBuffers(1,$buffers); glBindBuffer(GL_ARRAY_BUFFER,$buffers[0]);
		glBufferData(GL_ARRAY_BUFFER,4096,null,GL_STATIC_DRAW);
		glGenTextures(1,$textures); glBindTexture(GL_TEXTURE_2D,$textures[0]);
		glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,32,32,0,GL_RGBA,GL_UNSIGNED_BYTE,null);
		glGenFramebuffers(1,$framebuffers); glBindFramebuffer(GL_FRAMEBUFFER,$framebuffers[0]);
		glGenRenderbuffers(1,$renderbuffers); glBindRenderbuffer(GL_RENDERBUFFER,$renderbuffers[0]);
		glRenderbufferStorage(GL_RENDERBUFFER,GL_RGBA8,32,32);
		glGenVertexArrays(1,$arrays); glBindVertexArray($arrays[0]);
		$shader = glCreateShader(GL_VERTEX_SHADER); $program = glCreateProgram();
		$live = [glIsBuffer($buffers[0]),glIsTexture($textures[0]),glIsFramebuffer($framebuffers[0]),
			glIsRenderbuffer($renderbuffers[0]),glIsVertexArray($arrays[0]),glIsShader($shader),glIsProgram($program)];
		$error = glGetError();
		$mode = ${JSON.stringify(teardown)};
		if($mode === 'window') { SDL_DestroyWindow($window); }
		elseif($mode === 'window-owner') { unset($window); }
		elseif($mode === 'quit') { SDL_Quit(); }
		elseif($mode === 'video-quit') { SDL_VideoQuit(); }
		elseif($mode === 'video-init') { SDL_VideoInit(); }
		else { SDL_QuitSubSystem(SDL_INIT_VIDEO); }
		$closed = [(string)$context,(string)$alias,SDL_GL_GetCurrentContext()];
		$reject('closed',function() use ($alias) { SDL_GL_MakeCurrent(null,$alias); });
		SDL_GL_DeleteContext($context); SDL_GL_DeleteContext($alias); SDL_Quit();
		${setup}
		$context = SDL_GL_CreateContext($window);
		$stale = [glIsBuffer($buffers[0]),glIsTexture($textures[0]),glIsFramebuffer($framebuffers[0]),
			glIsRenderbuffer($renderbuffers[0]),glIsVertexArray($arrays[0]),glIsShader($shader),glIsProgram($program)];
		glClearColor(0,1,0,1); glClear(GL_COLOR_BUFFER_BIT);
		$pixel = bin2hex(glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE));
		SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
		echo json_encode(compact('live','stale','closed','rejected','pixel','error'));
		`);
		expect(result, teardown).toEqual({
			live: Array(7).fill(true), stale: Array(7).fill(false)
			, closed: ['SDL_GLContext()', 'SDL_GLContext()', null], rejected: ['closed'], pixel: '00ff00ff', error: 0
		});
		for(const [kind, counts] of Object.entries(await gpuCounts(page)))
		{
			expect(counts.created, `${teardown}: ${kind} was exercised`).toBeGreaterThan(0);
			expect(counts.live, `${teardown}: ${kind} live objects`).toBe(0);
			expect(counts.deleted, `${teardown}: ${kind} deletions`).toBe(counts.created);
		}
	}
});

test('video reference counts preserve the context until the last subsystem quit', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$context = new SDL_GLContext($window); $alias = SDL_GL_GetCurrentContext();
	SDL_InitSubSystem(SDL_INIT_VIDEO);
	SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$stillVideo = SDL_WasInit(SDL_INIT_VIDEO);
	$stillContext = SDL_GL_MakeCurrent($window,$alias);
	glClearColor(0,0,1,1); glClear(GL_COLOR_BUFFER_BIT);
	$pixel = bin2hex(glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE));
	SDL_QuitSubSystem(SDL_INIT_VIDEO);
	$closed = [(string)$context,(string)$alias,SDL_WasInit(SDL_INIT_VIDEO),SDL_GL_GetCurrentContext()];
	$reject('closed',function() use ($window,$alias) { SDL_GL_MakeCurrent($window,$alias); });
	SDL_Quit(); echo json_encode(compact('stillVideo','stillContext','pixel','closed','rejected'));
	`);
	expect(result.stillVideo).not.toBe(0);
	expect(result).toMatchObject({stillContext: 0, pixel: '0000ffff', closed: ['SDL_GLContext()', 'SDL_GLContext()', 0, null], rejected: ['closed']});
});

test('renderer-owned contexts reject explicit deletion and invalidate aliases on teardown', async ({page}) => {
	await watchGpu(page);
	await start(page);
	for(const teardown of ['renderer', 'window', 'subsystem', 'video-init'])
	{
		const result = await run(page, String.raw`${rejectHelper}
		SDL_Init(SDL_INIT_VIDEO);
		$window = new SDL_Window('Renderer owner',0,0,64,64,SDL_WINDOW_SHOWN);
		$renderer = SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED);
		if(!$renderer) { throw new RuntimeException(SDL_GetError()); }
		$alias = SDL_GL_GetCurrentContext();
		$reject('renderer-owned',function() use ($alias) { SDL_GL_DeleteContext($alias); });
		$reject('second-context',function() use ($window) { SDL_GL_CreateContext($window); });
		$reject('second-renderer',function() use ($window) { SDL_CreateRenderer($window,-1,SDL_RENDERER_ACCELERATED); });
		SDL_SetRenderDrawColor($renderer,255,0,0,255); $clear = SDL_RenderClear($renderer); SDL_RenderPresent($renderer);
		glGenBuffers(1,$buffers); glBindBuffer(GL_ARRAY_BUFFER,$buffers[0]);
		glBufferData(GL_ARRAY_BUFFER,512,null,GL_STATIC_DRAW);
		$mode = ${JSON.stringify(teardown)};
		if($mode === 'renderer') { SDL_DestroyRenderer($renderer); SDL_DestroyWindow($window); }
		elseif($mode === 'window') { SDL_DestroyWindow($window); }
		elseif($mode === 'video-init') { SDL_VideoInit(); }
		else { SDL_QuitSubSystem(SDL_INIT_VIDEO); }
		$closed = [(string)$alias,SDL_GL_GetCurrentContext()];
		$reject('closed-alias',function() use ($window,$alias) { SDL_GL_MakeCurrent($window,$alias); });
		$reject('closed-renderer',function() use ($renderer) { SDL_RenderClear($renderer); });
		SDL_GL_DeleteContext($alias); SDL_Quit(); echo json_encode(compact('clear','closed','rejected'));
		`);
		expect(result, teardown).toEqual({clear: 0, closed: ['SDL_GLContext()', null], rejected: ['renderer-owned', 'second-context', 'second-renderer', 'closed-alias', 'closed-renderer']});
		for(const [kind, counts] of Object.entries(await gpuCounts(page)))
		{
			expect(counts.live, `${teardown}: ${kind}`).toBe(0);
		}
	}
});

test('generated GL outputs survive typed-reference failure and context-changing destructors', async ({page}) => {
	await watchGpu(page);
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$context = new SDL_GLContext($window);
	class BadOutput { public int $value = 1; }
	$typed = new BadOutput;
	class ContextChanger {
		public $replace;
		function __construct($replace) { $this->replace = $replace; }
		function __destruct() {
			global $context, $window;
			if($this->replace) { SDL_GL_DeleteContext($context); $context = new SDL_GLContext($window); }
			else { SDL_GL_MakeCurrent(null,null); }
		}
	}
	$results = [];
	foreach(['glGenBuffers','glGenTextures','glGenVertexArrays','glGenFramebuffers','glGenRenderbuffers'] as $generate) {
		$reject('typed-'.$generate,function() use ($generate,$typed) { $generate(2,$typed->value); });
		$output = new ContextChanger(true);
		$reject('replace-'.$generate,function() use ($generate,&$output) { $generate(2,$output); });
		$results[] = count($output);
		$output = new ContextChanger(false);
		$reject('unbind-'.$generate,function() use ($generate,&$output) { $generate(2,$output); });
		$results[] = SDL_GL_GetCurrentContext() === null;
		SDL_GL_MakeCurrent($window,$context);
	}
	$error = glGetError(); $typedValue = $typed->value;
	SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
	echo json_encode(compact('results','typedValue','error','rejected'));
	`);
	expect(result.results).toEqual(Array.from({length: 5}, () => [2, true]).flat());
	expect(result.typedValue).toBe(1);
	expect(result.error).toBe(0);
	expect(result.rejected).toEqual(['glGenBuffers', 'glGenTextures', 'glGenVertexArrays', 'glGenFramebuffers', 'glGenRenderbuffers'].flatMap(name => [`typed-${name}`, `replace-${name}`, `unbind-${name}`]));
	for(const [kind, counts] of Object.entries(await gpuCounts(page)))
	{
		expect(counts.live, kind).toBe(0);
	}
});

test('deleted shader and program names fail in PHP and repeated contexts release allocations', async ({page}) => {
	await watchGpu(page);
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$context = new SDL_GLContext($window);
	$shader = glCreateShader(GL_VERTEX_SHADER); $program = glCreateProgram();
	glDeleteShader($shader); glDeleteProgram($program);
	$reject('source',function() use ($shader) { glShaderSource($shader,1,'void main(){}'); });
	$reject('compile',function() use ($shader) { glCompileShader($shader); });
	$reject('shader-query',function() use ($shader) { glGetShaderiv($shader,GL_COMPILE_STATUS); });
	$reject('shader-log',function() use ($shader) { glGetShaderInfoLog($shader); });
	$reject('link',function() use ($program) { glLinkProgram($program); });
	$reject('use',function() use ($program) { glUseProgram($program); });
	$reject('program-query',function() use ($program) { glGetProgramiv($program,GL_LINK_STATUS); });
	$reject('program-log',function() use ($program) { glGetProgramInfoLog($program); });
	$reject('attribute',function() use ($program) { glGetAttribLocation($program,'a'); });
	$reject('uniform',function() use ($program) { glGetUniformLocation($program,'u'); });
	$reject('attach',function() use ($program,$shader) { glAttachShader($program,$shader); });
	$reject('detach',function() use ($program,$shader) { glDetachShader($program,$shader); });
	$error = glGetError();
	SDL_GL_DeleteContext($context);
	for($i=0;$i<40;$i++) {
		$context = new SDL_GLContext($window);
		glGenBuffers(8,$buffers);
		foreach($buffers as $buffer) { glBindBuffer(GL_ARRAY_BUFFER,$buffer); glBufferData(GL_ARRAY_BUFFER,8192,null,GL_DYNAMIC_DRAW); }
		glGenTextures(4,$textures);
		foreach($textures as $texture) { glBindTexture(GL_TEXTURE_2D,$texture); glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,64,64,0,GL_RGBA,GL_UNSIGNED_BYTE,null); }
		glCreateShader(GL_VERTEX_SHADER); glCreateProgram();
		unset($context);
	}
	SDL_DestroyWindow($window); SDL_Quit(); echo json_encode(compact('error','rejected'));
	`);
	expect(result).toEqual({error: 0, rejected: ['source', 'compile', 'shader-query', 'shader-log', 'link', 'use', 'program-query', 'program-log', 'attribute', 'uniform', 'attach', 'detach']});
	const counts = await gpuCounts(page);
	expect(counts.Buffer.created).toBe(320);
	expect(counts.Texture.created).toBe(160);
	for(const [kind, {live, created, deleted}] of Object.entries(counts))
	{
		expect(live, kind).toBe(0);
		expect(deleted, kind).toBe(created);
	}
});

test('request refresh releases GL resources left in PHP globals and supports another run', async ({page}) => {
	await watchGpu(page);
	await start(page);
	for(let iteration = 0; iteration < 3; iteration++)
	{
		await run(page, String.raw`${setup}
		$context = new SDL_GLContext($window); $alias = SDL_GL_GetCurrentContext();
		glGenBuffers(2,$buffers); glBindBuffer(GL_ARRAY_BUFFER,$buffers[0]);
		glBufferData(GL_ARRAY_BUFFER,1024,null,GL_DYNAMIC_DRAW);
		glCreateShader(GL_VERTEX_SHADER); glCreateProgram();
		`);
		expect((await gpuCounts(page)).Buffer.live).toBe(2);
		await page.evaluate(async () => { await window.bindingPhp.refresh(); });
		for(const [kind, counts] of Object.entries(await gpuCounts(page)))
		{
			expect(counts.live, `refresh ${iteration}: ${kind}`).toBe(0);
		}
	}
});
