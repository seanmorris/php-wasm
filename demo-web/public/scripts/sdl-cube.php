<?php //{"autorun":true,"persist":true,"single-expression":false,"render-as":"text","canvas":true,"variant":"_sdl","extensionFlags":0,"assets":"sdl"}

// All rendering, input polling, image decoding, font rasterization and mixing
// happen in PHP. Vrzno supplies the browser's animation and DOM callbacks.
$browser = new Vrzno;
$shared = vrzno_env('shared');
if($shared->sdlCleanup)
{
	($shared->sdlCleanup)();
}

foreach(['sdl', 'sdl_image', 'sdl_mixer', 'sdl_ttf', 'opengl'] as $extension)
{
	if(!extension_loaded($extension))
	{
		throw new RuntimeException("The SDL cube requires the _sdl runtime with $extension enabled.");
	}
}

$demo = new class($browser, vrzno_env('canvas'), vrzno_env('onRefresh'), $shared) {
	private $browser, $canvas, $refresh, $shared, $status, $button, $panel;
	private $window = null, $context = null, $font = null, $music = null, $effect = null;
	private $program = 0, $textures = [], $buffers = [], $listeners = [], $keys = [];
	private $matrixLocation, $overlayLocation, $frame, $cleanup, $animation = 0;
	private $stopped = false, $lost = false, $paused = false, $muted = true, $audio = false;
	private $audioError = null;
	private $x = .35, $y = .55, $last = 0, $frames = 0, $started = 0;
	private $width = 640, $height = 400, $textWidth = 0, $textHeight = 0;
	private $resizeObserver = null, $resizePending = true;
	private const WIDTH = 640, HEIGHT = 400;

	public function __construct($browser, $canvas, $refresh, $shared)
	{
		$this->browser = $browser;
		$this->canvas = $canvas;
		$this->refresh = $refresh;
		$this->shared = $shared;
		$browser->document->querySelector('#example')->replaceChildren();
		$this->canvas->dataset->stopped = '0';
		$this->canvas->dataset->pixelArt = '1';
		$this->panel = $browser->document->createElement('div');
		$this->panel->className = 'sdl-controls';
		$this->panel->innerHTML = '<button type="button" data-sdl-audio>Enable audio</button>'
			. '<span role="status" data-sdl-status>Starting SDL...</span>'
			. '<small data-sdl-credit>Music: Unreal Superhero 3 — Kenët and rez</small>'
			. '<small>Focus the canvas: arrows/WASD rotate · Space pauses · R resets · M mutes · Esc stops</small>';
		$browser->document->querySelector('#example')->appendChild($this->panel);
		$this->button = $this->panel->querySelector('[data-sdl-audio]');
		$this->status = $this->panel->querySelector('[data-sdl-status]');
		$this->cleanup = function() { $this->stop(); };
		$this->refresh->add($this->cleanup);
		$this->shared->sdlCleanup = $this->cleanup;
	}

	private function check($condition, string $operation): void
	{
		if(!$condition)
		{
			throw new RuntimeException($operation . ': ' . SDL_GetError());
		}
	}

	private function listen($target, string $name, $callback): void
	{
		$target->addEventListener($name, $callback);
		$this->listeners[] = [$target, $name, $callback];
	}

	public function start(): void
	{
		$this->canvas->width = self::WIDTH;
		$this->canvas->height = self::HEIGHT;
		$this->check(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) === 0, 'SDL initialization');
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
		SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
		SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
		$this->window = SDL_CreateWindow('PHP SDL cube', 0, 0, self::WIDTH, self::HEIGHT, SDL_WINDOW_OPENGL | SDL_WINDOW_SHOWN);
		$this->check($this->window, 'Create SDL window');
		$this->context = SDL_GL_CreateContext($this->window);
		$this->check($this->context, 'Create WebGL2 context (WebGL2 must be enabled in your browser)');
		$this->check(SDL_GL_MakeCurrent($this->window, $this->context) === 0, 'Make GL context current');
		$this->check(TTF_Init() === 0, 'Initialize fonts');
		$this->font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf', 18);
		$this->check($this->font, 'Load font');
		$this->buildGraphics();
		$ResizeObserver = $this->browser->ResizeObserver;
		$this->resizeObserver = new $ResizeObserver(function() { $this->resizePending = true; });
		$this->resizeObserver->observe($this->canvas);

		$this->listen($this->button, 'click', function() {
			try
			{
				$this->toggleAudio();
				$this->canvas->focus();
			}
			catch(Throwable $error)
			{
				$this->audioError = 'Audio unavailable: ' . $error->getMessage();
				$this->status->textContent = $this->audioError;
				$this->button->textContent = 'Retry audio';
			}
		});
		$this->listen($this->canvas, 'pointerdown', function() { $this->canvas->focus(); });
		$this->listen($this->canvas, 'keydown', function($event) {
			if(in_array($event->code, ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyM', 'Escape'], true))
			{
				$event->preventDefault();
			}
		});
		$this->listen($this->canvas, 'blur', function() {
			$this->keys = [];
			if($this->audio) { Mix_PauseMusic(); Mix_HaltChannel(-1); }
		});
		$this->listen($this->canvas, 'focus', function() {
			if($this->audio && !$this->muted && !$this->lost) { Mix_ResumeMusic(); }
		});
		$this->listen($this->canvas, 'webglcontextlost', function($event) {
			$event->preventDefault();
			$this->lost = true;
			$this->browser->cancelAnimationFrame($this->animation);
			$this->releaseGraphics();
			if($this->audio) { Mix_PauseMusic(); Mix_HaltChannel(-1); }
			$this->status->textContent = 'Graphics context lost. Waiting for recovery...';
		});
		$this->listen($this->canvas, 'webglcontextrestored', function() {
			try
			{
				$this->lost = false;
				$this->buildGraphics();
				$this->last = 0;
				$this->status->textContent = 'Graphics restored';
				if($this->audio && !$this->muted && $this->canvas->matches(':focus')) { Mix_ResumeMusic(); }
				$this->animation = $this->browser->requestAnimationFrame($this->frame);
			}
			catch(Throwable $error) { $this->fail($error); }
		});
		$this->listen($this->browser, 'pagehide', $this->cleanup);
		$this->frame = function($time) {
			try { $this->render($time); }
			catch(Throwable $error) { $this->fail($error); }
		};
		$this->started = $this->browser->performance->now();
		$this->animation = $this->browser->requestAnimationFrame($this->frame);
		$this->canvas->focus();
		$this->status->textContent = 'Running · sound off';
	}

	private function shader(int $type, string $source): int
	{
		$shader = glCreateShader($type);
		glShaderSource($shader, 1, $source);
		glCompileShader($shader);
		if(!glGetShaderiv($shader, GL_COMPILE_STATUS))
		{
			$log = glGetShaderInfoLog($shader);
			glDeleteShader($shader);
			throw new RuntimeException('Shader compilation failed: ' . $log);
		}
		return $shader;
	}

	private function uploadSurface($surface, int $texture, int $filter = GL_LINEAR): void
	{
		$this->check($surface, 'Decode texture');
		try
		{
			glBindTexture(GL_TEXTURE_2D, $texture);
			glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, $surface->w, $surface->h, 0, GL_RGBA, GL_UNSIGNED_BYTE, $surface);
			glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, $filter);
			glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, $filter);
			glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
			glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
		}
		finally { SDL_FreeSurface($surface); }
	}

	private function buildGraphics(): void
	{
		$vertex = $fragment = 0;
		try
		{
			$vertex = $this->shader(GL_VERTEX_SHADER, "#version 300 es\nlayout(location=0) in vec3 position;\nlayout(location=1) in vec2 uv;\nlayout(location=2) in float light;\nuniform mat4 matrix;\nuniform highp int overlay;\nout vec2 texCoord;\nout float shade;\nvoid main(){ gl_Position=overlay==1?vec4(position,1.0):matrix*vec4(position,1.0); texCoord=uv; shade=light; }");
			$fragment = $this->shader(GL_FRAGMENT_SHADER, "#version 300 es\nprecision mediump float;\nin vec2 texCoord;\nin float shade;\nuniform sampler2D image;\nuniform highp int overlay;\nout vec4 color;\nvoid main(){ vec4 sampleColor=texture(image,texCoord); if(overlay==0){ sampleColor=vec4(mix(vec3(0.12,0.18,0.24),sampleColor.rgb,sampleColor.a),1.0); } color=vec4(sampleColor.rgb*shade,sampleColor.a); }");
			$this->program = glCreateProgram();
			glAttachShader($this->program, $vertex);
			glAttachShader($this->program, $fragment);
			glLinkProgram($this->program);
			if(!glGetProgramiv($this->program, GL_LINK_STATUS))
			{
				throw new RuntimeException('Shader link failed: ' . glGetProgramInfoLog($this->program));
			}
		}
		finally
		{
			if($vertex) { glDeleteShader($vertex); }
			if($fragment) { glDeleteShader($fragment); }
		}
		glUseProgram($this->program);
		$this->matrixLocation = glGetUniformLocation($this->program, 'matrix');
		$this->overlayLocation = glGetUniformLocation($this->program, 'overlay');
		glUniform1i(glGetUniformLocation($this->program, 'image'), 0);
		glGenTextures(2, $this->textures);
		glActiveTexture(GL_TEXTURE0);
		$this->uploadSurface(IMG_Load('/preload/sdl/sean-icon-32.png'), $this->textures[0], GL_NEAREST);
		$text = TTF_RenderText_Blended($this->font, 'PHP / SDL + OpenGL', new SDL_Color(255, 255, 255, 255));
		$this->check($text, 'Render text');
		$this->textWidth = $text->w;
		$this->textHeight = $text->h;
		$this->uploadSurface($text, $this->textures[1]);

		$vertices = $indices = [];
		$faces = [
			[[-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]],
			[[1,-1,-1], [-1,-1,-1], [-1,1,-1], [1,1,-1]],
			[[1,-1,1], [1,-1,-1], [1,1,-1], [1,1,1]],
			[[-1,-1,-1], [-1,-1,1], [-1,1,1], [-1,1,-1]],
			[[-1,1,1], [1,1,1], [1,1,-1], [-1,1,-1]],
			[[-1,-1,-1], [1,-1,-1], [1,-1,1], [-1,-1,1]]
		];
		$uv = [[0,1], [1,1], [1,0], [0,0]];
		foreach($faces as $face => $points)
		{
			foreach($points as $index => $point) { array_push($vertices, ...array_merge($point, $uv[$index], [.6 + ($face % 3) * .2])); }
			foreach([0,1,2,0,2,3] as $index) { $indices[] = $face * 4 + $index; }
		}
		glGenBuffers(3, $this->buffers);
		foreach([[0, GL_ARRAY_BUFFER, pack('g*', ...$vertices)], [1, GL_ELEMENT_ARRAY_BUFFER, pack('v*', ...$indices)]] as [$index, $target, $bytes])
		{
			glBindBuffer($target, $this->buffers[$index]);
			glBufferData($target, strlen($bytes), $bytes, GL_STATIC_DRAW);
		}
		$this->resizePending = true;
		$this->resize();
		glClearColor(.025, .04, .075, 1);
		glEnable(GL_BLEND);
		glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
		if($error = glGetError()) { throw new RuntimeException('OpenGL setup error: ' . $error); }
	}

	private function resize(): void
	{
		if(!$this->resizePending) { return; }
		$this->resizePending = false;
		$width = max(1, (int)$this->canvas->clientWidth);
		$height = max(1, (int)$this->canvas->clientHeight);
		if($this->canvas->width !== $width || $this->canvas->height !== $height)
		{
			SDL_SetWindowSize($this->window, $width, $height);
			$this->canvas->width = $width;
			$this->canvas->height = $height;
		}
		$this->width = $width;
		$this->height = $height;
		glViewport(0, 0, $width, $height);
		$left = -1 + 24 / $width;
		$top = 1 - 24 / $height;
		$right = $left + 2 * $this->textWidth / $width;
		$bottom = $top - 2 * $this->textHeight / $height;
		$overlay = [$left,$bottom,0,0,1,1, $right,$bottom,0,1,1,1, $left,$top,0,0,0,1, $right,$top,0,1,0,1];
		$bytes = pack('g*', ...$overlay);
		glBindBuffer(GL_ARRAY_BUFFER, $this->buffers[2]);
		glBufferData(GL_ARRAY_BUFFER, strlen($bytes), $bytes, GL_STATIC_DRAW);
	}

	private function attributes(int $buffer): void
	{
		glBindBuffer(GL_ARRAY_BUFFER, $buffer);
		foreach([[0,3,0], [1,2,12], [2,1,20]] as [$index, $size, $offset])
		{
			glEnableVertexAttribArray($index);
			glVertexAttribPointer($index, $size, GL_FLOAT, false, 24, $offset);
		}
	}

	private function matrix(): array
	{
		// Column-major perspective * translation * rotationY * rotationX.
		$cx = cos($this->x); $sx = sin($this->x); $cy = cos($this->y); $sy = sin($this->y);
		$model = [$cy,0,-$sy,0, $sy*$sx,$cx,$cy*$sx,0, $sy*$cx,-$sx,$cy*$cx,0, 0,0,-5,1];
		$aspect = $this->width / $this->height;
		// Keep the same field of view on the shorter axis in landscape or portrait.
		$f = min(1, $aspect) / tan(M_PI / 8);
		$projection = [$f/$aspect,0,0,0, 0,$f,0,0, 0,0,-100.1/99.9,-1, 0,0,-20/99.9,0];
		$result = array_fill(0, 16, 0.0);
		for($column = 0; $column < 4; $column++)
		{
			for($row = 0; $row < 4; $row++)
			{
				for($k = 0; $k < 4; $k++) { $result[$column*4+$row] += $projection[$k*4+$row] * $model[$column*4+$k]; }
			}
		}
		return $result;
	}

	private function input(float $delta): void
	{
		$event = new SDL_Event;
		$focused = $this->canvas->matches(':focus');
		while(SDL_PollEvent($event))
		{
			if($event->type !== SDL_KEYDOWN && $event->type !== SDL_KEYUP) { continue; }
			$key = $event->key->keysym->sym;
			if($event->type === SDL_KEYUP) { unset($this->keys[$key]); continue; }
			if(!$focused || isset($this->keys[$key])) { continue; }
			$this->keys[$key] = true;
			if($key === SDLK_SPACE) { $this->paused = !$this->paused; }
			if($key === SDLK_r) { $this->x = .35; $this->y = .55; }
			if($key === SDLK_m && $this->audio) { $this->toggleAudio(); }
			if($key === SDLK_ESCAPE) { $this->stop(); return; }
			if($this->audio && !$this->muted && in_array($key, [SDLK_SPACE, SDLK_r, SDLK_m], true))
			{
				Mix_PlayChannel(-1, $this->effect, 0);
			}
		}
		if(!$focused) { return; }
		$keys = SDL_GetKeyboardState();
		$this->x += $delta * 1.8 * (($keys[SDL_SCANCODE_DOWN] || $keys[SDL_SCANCODE_S]) - ($keys[SDL_SCANCODE_UP] || $keys[SDL_SCANCODE_W]));
		$this->y += $delta * 1.8 * (($keys[SDL_SCANCODE_RIGHT] || $keys[SDL_SCANCODE_D]) - ($keys[SDL_SCANCODE_LEFT] || $keys[SDL_SCANCODE_A]));
	}

	private function render(float $time): void
	{
		if($this->stopped || $this->lost) { return; }
		// The browser can lose the context just before dispatching its event.
		if($this->canvas->getContext('webgl2')->isContextLost()) { return; }
		$this->resize();
		$delta = $this->last ? min(.05, ($time - $this->last) / 1000) : 0;
		$this->last = $time;
		$this->input($delta);
		if($this->stopped) { return; }
		if(!$this->paused) { $this->y += $delta * .45; }
		glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
		glUseProgram($this->program);
		glEnable(GL_DEPTH_TEST);
		glUniform1i($this->overlayLocation, 0);
		glUniformMatrix4fv($this->matrixLocation, 1, false, $this->matrix());
		$this->attributes($this->buffers[0]);
		glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, $this->buffers[1]);
		glBindTexture(GL_TEXTURE_2D, $this->textures[0]);
		glDrawElements(GL_TRIANGLES, 36, GL_UNSIGNED_SHORT, 0);
		glDisable(GL_DEPTH_TEST);
		glUniform1i($this->overlayLocation, 1);
		$this->attributes($this->buffers[2]);
		glBindTexture(GL_TEXTURE_2D, $this->textures[1]);
		glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
		SDL_GL_SwapWindow($this->window);
		$this->frames++;
		$this->canvas->dataset->frames = (string)$this->frames;
		$this->canvas->dataset->rotation = sprintf('%.4f,%.4f', $this->x, $this->y);
		$this->canvas->dataset->paused = $this->paused ? '1' : '0';
		if($this->frames === 1 || $this->frames % 30 === 0)
		{
			$this->status->textContent = $this->audioError ?? (($this->paused ? 'Paused' : 'Running') . ' · sound ' . ($this->muted ? 'off' : 'on'));
			$this->canvas->dataset->fps = (string)round($this->frames * 1000 / max(1, $time - $this->started), 1);
		}
		$this->animation = $this->browser->requestAnimationFrame($this->frame);
	}

	private function toggleAudio(): void
	{
		if($this->stopped || $this->lost) { return; }
		if(!$this->audio)
		{
			try
			{
				$this->check(Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 1024) === 0, 'Open audio');
				$this->audio = true;
				$this->check((Mix_Init(MIX_INIT_MP3) & MIX_INIT_MP3) === MIX_INIT_MP3, 'Initialize MP3 decoder');
				$this->music = Mix_LoadMUS('/preload/sdl/WOJTEK3.mp3');
				$this->check($this->music, 'Decode music');
				$this->effect = Mix_LoadWAV('/preload/sdl/click.wav');
				$this->check($this->effect, 'Decode effect');
				Mix_VolumeMusic(48);
				$this->check(Mix_PlayMusic($this->music, -1) === 0, 'Play music');
			}
			catch(Throwable $error)
			{
				if($this->music) { Mix_FreeMusic($this->music); $this->music = null; }
				if($this->effect) { Mix_FreeChunk($this->effect); $this->effect = null; }
				if($this->audio) { Mix_CloseAudio(); Mix_Quit(); $this->audio = false; }
				throw $error;
			}
		}
		$this->audioError = null;
		$this->muted = !$this->muted;
		if($this->muted) { Mix_PauseMusic(); Mix_HaltChannel(-1); }
		else { Mix_ResumeMusic(); Mix_PlayChannel(-1, $this->effect, 0); }
		$this->button->textContent = $this->muted ? 'Enable audio' : 'Mute audio';
	}

	public function fail(Throwable $error): void
	{
		$this->stop();
		$this->status->textContent = $error->getMessage();
		file_put_contents('php://stderr', $error->getMessage() . "\n");
	}

	private function releaseGraphics(): void
	{
		if(!$this->context) { return; }
		if($this->buffers) { glDeleteBuffers(count($this->buffers), $this->buffers); }
		if($this->textures) { glDeleteTextures(count($this->textures), $this->textures); }
		if($this->program) { glDeleteProgram($this->program); }
		$this->buffers = $this->textures = [];
		$this->program = 0;
	}

	public function stop(): void
	{
		if($this->stopped) { return; }
		$this->stopped = true;
		$this->browser->cancelAnimationFrame($this->animation);
		if($this->resizeObserver) { $this->resizeObserver->disconnect(); $this->resizeObserver = null; }
		foreach($this->listeners as [$target, $name, $callback]) { $target->removeEventListener($name, $callback); }
		$this->listeners = [];
		$this->refresh->delete($this->cleanup);
		$this->shared->sdlCleanup = null;
		if($this->audio) { Mix_HaltMusic(); Mix_HaltChannel(-1); }
		if($this->music) { Mix_FreeMusic($this->music); $this->music = null; }
		if($this->effect) { Mix_FreeChunk($this->effect); $this->effect = null; }
		if($this->audio) { Mix_CloseAudio(); Mix_Quit(); $this->audio = false; }
		$this->releaseGraphics();
		if($this->font) { TTF_CloseFont($this->font); $this->font = null; }
		TTF_Quit();
		if($this->context) { SDL_GL_DeleteContext($this->context); $this->context = null; }
		if($this->window) { SDL_DestroyWindow($this->window); $this->window = null; }
		SDL_Quit();
		$this->button->disabled = true;
		$this->status->textContent = 'Stopped · Run to restart';
		$this->canvas->dataset->stopped = '1';
	}
};
try { $demo->start(); }
catch(Throwable $error) { $demo->fail($error); }
