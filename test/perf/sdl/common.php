<?php

function perfClock(): float
{
	return (float)SDL_GetPerformanceCounter() * 1000 / (float)SDL_GetPerformanceFrequency();
}

function perfCheck(bool $condition, string $message): void
{
	if(!$condition) { throw new RuntimeException($message); }
}

function perfProgram(string $vertex, string $fragment): int
{
	$program = glCreateProgram();
	foreach([[GL_VERTEX_SHADER, $vertex], [GL_FRAGMENT_SHADER, $fragment]] as [$type, $source])
	{
		$shader = glCreateShader($type);
		glShaderSource($shader, 1, $source);
		glCompileShader($shader);
		perfCheck((bool)glGetShaderiv($shader, GL_COMPILE_STATUS), glGetShaderInfoLog($shader));
		glAttachShader($program, $shader);
		glDeleteShader($shader);
	}
	glLinkProgram($program);
	perfCheck((bool)glGetProgramiv($program, GL_LINK_STATUS), glGetProgramInfoLog($program));
	return $program;
}

function perfContext(): array
{
	perfCheck(SDL_Init(SDL_INIT_VIDEO) === 0, SDL_GetError());
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
	$window = SDL_CreateWindow('SDL throughput', 0, 0, 128, 128, SDL_WINDOW_OPENGL);
	$context = SDL_GL_CreateContext($window);
	perfCheck((bool)$context, SDL_GetError());
	perfCheck(SDL_GL_MakeCurrent($window, $context) === 0, SDL_GetError());
	glViewport(0, 0, 128, 128);
	glDisable(GL_DITHER);
	glClearColor(0, 0, 0, 1);
	return [$window, $context];
}

// Finishing and validation are separate: byte comparisons are outside timings.
function perfMeasure(string $name): array
{
	global $cases;
	$case = $cases[$name];
	$case['prepare']();
	$start = perfClock();
	for($batch = 0; $batch < $case['batches']; $batch++) { $case['submit']($batch); }
	$submitted = perfClock();
	$result = $case['finish']();
	$finished = perfClock();
	$case['verify']($result);
	return [
		'submitMs' => $submitted - $start, 'finishMs' => $finished - $submitted
		, 'totalMs' => $finished - $start
	];
}

$fullTriangle = '#version 300 es
void main() {
	vec2 p[3] = vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
	gl_Position = vec4(p[gl_VertexID],0,1);
}';
$clear = function() { glClear(GL_COLOR_BUFFER_BIT); glFinish(); };
$read = function() { return glReadPixels(0, 0, 128, 128, GL_RGBA, GL_UNSIGNED_BYTE); };
$cases = [];
