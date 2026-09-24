<?php //{"autorun":true,"persist":true,"single-expression":false,"render-as":"text","canvas":true,"runtime":"sdl","extensionFlags":0,"assets":"sdl"}

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
		throw new RuntimeException("The SDL cube requires php-sdl-wasm with $extension enabled.");
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
	private $messages = [], $glyphs = [], $letters = [], $glyphWidth = 0;
	private $messageIndex = 0, $messageTime = 0, $textTime = 0, $textExit = 0, $textDuration = 0;
	private $textScale = 1;
	private $resizeObserver = null, $resizePending = true;
	private const WIDTH = 640, HEIGHT = 400;
	private const SPIN_SPEED = .6, KEYBOARD_SPEED = 3.6;
	private const MESSAGES = [
		'Hello, World! Welcome to PHP-WASM!',
		'This is the PHP/SDL + OPENGL Demo!',
		'Focus the canvas: arrows/WASD rotate · Space pauses · R resets · M mutes · Esc stops',
		'You are listening to Unreal Superhero 3 by Kenët and rez'
	];

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
			. '<span role="status" data-sdl-status>Starting SDL...</span>';
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
		$this->font = TTF_OpenFont('/preload/sdl/DejaVuSansMono.ttf', 28);
		$this->check($this->font, 'Load font');
		TTF_SetFontStyle($this->font, TTF_STYLE_BOLD);
		TTF_SetFontKerning($this->font, 0);
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
			$vertex = $this->shader(GL_VERTEX_SHADER, <<<'GLSL'
				#version 300 es
				layout(location=0) in vec3 position;
				layout(location=1) in vec2 uv;
				layout(location=2) in float light;
				uniform mat4 matrix;
				uniform highp int overlay;
				out vec2 texCoord;
				out float shade;
				void main()
				{
					gl_Position = overlay != 0 ? vec4(position, 1.0) : matrix * vec4(position, 1.0);
					texCoord = uv;
					shade = light;
				}
				GLSL);
			$fragment = $this->shader(GL_FRAGMENT_SHADER, <<<'GLSL'
				#version 300 es
				precision highp float;
				in vec2 texCoord;
				in float shade;
				uniform sampler2D image;
				uniform highp int overlay;
				out vec4 color;
				void main()
				{
					if(overlay == 2)
					{
						// SDL_ttf supplies native bold glyphs and outlines; bake only the tint.
						vec4 glyph = texture(image, texCoord);
						vec3 tint = mix(vec3(0.25, 0.85, 1.0), vec3(0.88, 0.77, 0.59), texCoord.y);
						tint = mix(tint, vec3(1.0), 1.0 - smoothstep(0.0, 0.24, abs(texCoord.y - 0.48)));
						color = vec4(tint * glyph.rgb, glyph.a);
					}
					else if(overlay == 1)
					{
						color = texture(image, texCoord);
					}
					else
					{
						vec4 sampleColor = texture(image, texCoord);
						color = vec4(mix(vec3(0.12, 0.18, 0.24), sampleColor.rgb, sampleColor.a) * shade, 1.0);
					}
				}
				GLSL);
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
		glGenTextures(3, $this->textures);
		glActiveTexture(GL_TEXTURE0);
		$this->uploadSurface(IMG_Load('/preload/sdl/sean-icon-32.png'), $this->textures[0], GL_NEAREST);
		$this->messages = self::MESSAGES;
		// Keep code points intact, including ë and ·, while caching each glyph once.
		$characters = array_values(array_unique($this->characters(implode('', $this->messages))));
		$this->glyphs = array_flip($characters);
		$atlas = ' ' . implode('  ', $characters) . ' ';
		$this->check(TTF_SizeUTF8($this->font, ' ', $advance, $height) === 0, 'Measure font');
		$this->glyphWidth = $advance;
		TTF_SetFontOutline($this->font, 0);
		$fill = TTF_RenderUTF8_Blended($this->font, $atlas, new SDL_Color(255, 255, 255, 255));
		$this->check($fill, 'Render text');
		try
		{
			TTF_SetFontOutline($this->font, 2);
			$text = TTF_RenderUTF8_Blended($this->font, $atlas, new SDL_Color(0, 0, 0, 255));
			$this->check($text, 'Render text outline');
			try
			{
				$destination = new SDL_Rect(2, 2, $fill->w, $fill->h);
				$this->check(SDL_UpperBlit($fill, null, $text, $destination) === 0, 'Composite text');
				$this->textWidth = $text->w;
				$this->textHeight = $text->h;
			}
			catch(Throwable $error)
			{
				SDL_FreeSurface($text);
				throw $error;
			}
		}
		finally
		{
			TTF_SetFontOutline($this->font, 0);
			SDL_FreeSurface($fill);
		}
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
		$this->styleText();
		$this->resizePending = true;
		$this->resize();
		glClearColor(.025, .04, .075, 1);
		glEnable(GL_BLEND);
		glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
		if($error = glGetError()) { throw new RuntimeException('OpenGL setup error: ' . $error); }
	}

	private function styleText(): void
	{
		// Bake the gradient once; animation only samples the native bold/outlined atlas.
		glBindTexture(GL_TEXTURE_2D, $this->textures[2]);
		glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, $this->textWidth, $this->textHeight, 0, GL_RGBA, GL_UNSIGNED_BYTE, null);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
		$framebuffers = [];
		glGenFramebuffers(1, $framebuffers);
		try
		{
			glBindFramebuffer(GL_FRAMEBUFFER, $framebuffers[0]);
			glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, $this->textures[2], 0);
			if(glCheckFramebufferStatus(GL_FRAMEBUFFER) !== GL_FRAMEBUFFER_COMPLETE)
			{
				throw new RuntimeException('Cannot create the text atlas framebuffer.');
			}
			glViewport(0, 0, $this->textWidth, $this->textHeight);
			glDisable(GL_DEPTH_TEST);
			glDisable(GL_BLEND);
			$bytes = pack('g*', -1,-1,0,0,0,1, 1,-1,0,1,0,1, -1,1,0,0,1,1, 1,1,0,1,1,1);
			$this->attributes($this->buffers[2]);
			glBufferData(GL_ARRAY_BUFFER, strlen($bytes), $bytes, GL_STATIC_DRAW);
			glBindTexture(GL_TEXTURE_2D, $this->textures[1]);
			glUniform1i($this->overlayLocation, 2);
			glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
		}
		finally
		{
			glBindFramebuffer(GL_FRAMEBUFFER, 0);
			glDeleteFramebuffers(count($framebuffers), $framebuffers);
		}
		glDeleteTextures(1, [$this->textures[1]]);
		$this->textures = [$this->textures[0], $this->textures[2]];
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
		$this->layoutText();
	}

	private function characters(string $text): array
	{
		return preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);
	}

	private function wrapText(string $text, int $columns): array
	{
		$lines = [];
		$line = [];
		foreach(explode(' ', $text) as $word)
		{
			$letters = $this->characters($word);
			if($line && count($line) + count($letters) + 1 > $columns)
			{
				$lines[] = $line;
				$line = [];
			}
			if($line) { $line[] = ' '; }
			foreach($letters as $letter)
			{
				if(count($line) === $columns)
				{
					$lines[] = $line;
					$line = [];
				}
				$line[] = $letter;
			}
		}
		if($line) { $lines[] = $line; }
		return $lines;
	}

	private function layoutText(): void
	{
		$this->textScale = min(1, $this->width / 480, $this->height / 240);
		$advance = ($this->glyphWidth + 3) * $this->textScale;
		$lineHeight = ($this->textHeight + 12) * $this->textScale;
		$columns = max(1, (int)(($this->width - 48 * $this->textScale) / $advance));
		$message = $this->messages[$this->messageIndex];
		$lines = $this->wrapText($message, $columns);
		$top = $this->height * .57 - count($lines) * $lineHeight / 2;
		$this->letters = [];
		foreach($lines as $row => $line)
		{
			$left = ($this->width - count($line) * $advance) / 2;
			foreach($line as $column => $letter)
			{
				$this->letters[] = [$letter, $left + $column * $advance, $top + $row * $lineHeight];
			}
		}
		$streamDuration = .8 + max(0, count($this->letters) - 1) * .035;
		$this->textExit = $streamDuration + max(2.8, count($this->characters($message)) * .055);
		$this->textDuration = $this->textExit + $streamDuration;
		$this->canvas->setAttribute('aria-label', 'Rotating textured cube. ' . self::MESSAGES[$this->messageIndex]);
	}

	private function renderText(): void
	{
		if($this->messageTime >= $this->textDuration)
		{
			$this->messageTime -= $this->textDuration;
			$this->messageIndex = ($this->messageIndex + 1) % count($this->messages);
			$this->layoutText();
		}
		$vertices = [];
		$padding = $this->glyphWidth * $this->textScale;
		$width = $padding * 3;
		$height = $this->textHeight * $this->textScale;
		$amplitude = min(16, $this->height * .04) * $this->textScale;
		foreach($this->letters as $index => [$letter, $x, $y])
		{
			if($letter === ' ') { continue; }
			$enter = max(0, min(1, ($this->messageTime - $index * .035) / .8));
			$leave = max(0, min(1, ($this->messageTime - $this->textExit - $index * .035) / .8));
			if($enter === 0 || $leave === 1) { continue; }
			// Letters stream in from the left, linger in reading order, then leave right.
			$x += ($this->width + $width) * ($leave ** 3 - (1 - $enter) ** 3) - $padding;
			if($x + $width < 0 || $x > $this->width) { continue; }
			$y += sin($this->textTime * 3.8 - $index * .43) * $amplitude;
			$left = -1 + 2 * $x / $this->width;
			$right = $left + 2 * $width / $this->width;
			$top = 1 - 2 * $y / $this->height;
			$bottom = $top - 2 * $height / $this->height;
			$u = $this->glyphs[$letter] * 3 * $this->glyphWidth / $this->textWidth;
			$v = $u + 3 * $this->glyphWidth / $this->textWidth;
			array_push($vertices,
				$left,$bottom,0,$u,1,1, $right,$bottom,0,$v,1,1, $left,$top,0,$u,0,1,
				$left,$top,0,$u,0,1, $right,$bottom,0,$v,1,1, $right,$top,0,$v,0,1
			);
		}
		if(!$vertices) { return; }
		// Draw the bold, outlined text with one batched vertex upload and one draw.
		$bytes = pack('g*', ...$vertices);
		$this->attributes($this->buffers[2]);
		glBufferData(GL_ARRAY_BUFFER, strlen($bytes), $bytes, GL_STREAM_DRAW);
		glBindTexture(GL_TEXTURE_2D, $this->textures[1]);
		glUniform1i($this->overlayLocation, 1);
		glDrawArrays(GL_TRIANGLES, 0, count($vertices) / 6);
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
			if($key === SDLK_r)
			{
				$this->x = .35; $this->y = .55;
				$this->messageIndex = $this->messageTime = $this->textTime = 0;
				$this->layoutText();
			}
			if($key === SDLK_m && $this->audio) { $this->toggleAudio(); }
			if($key === SDLK_ESCAPE) { $this->stop(); return; }
			if($this->audio && !$this->muted && in_array($key, [SDLK_SPACE, SDLK_r, SDLK_m], true))
			{
				Mix_PlayChannel(-1, $this->effect, 0);
			}
		}
		if(!$focused) { return; }
		$keys = SDL_GetKeyboardState();
		$this->x += $delta * self::KEYBOARD_SPEED * (($keys[SDL_SCANCODE_DOWN] || $keys[SDL_SCANCODE_S]) - ($keys[SDL_SCANCODE_UP] || $keys[SDL_SCANCODE_W]));
		$this->y += $delta * self::KEYBOARD_SPEED * (($keys[SDL_SCANCODE_RIGHT] || $keys[SDL_SCANCODE_D]) - ($keys[SDL_SCANCODE_LEFT] || $keys[SDL_SCANCODE_A]));
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
		if(!$this->paused)
		{
			$this->y += $delta * self::SPIN_SPEED;
			$this->messageTime += $delta;
			$this->textTime += $delta;
		}
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
		$this->renderText();
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
