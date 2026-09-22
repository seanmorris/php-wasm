<?php

[$window, $context] = perfContext();
$body = 'precision highp float;out vec4 color;
DECLARATION
void main(){color=colors[int(gl_FragCoord.x)%64];}';
$program = perfProgram($fullTriangle, "#version 300 es\n" . str_replace('DECLARATION', 'uniform vec4 colors[64];', $body));
$uboProgram = perfProgram($fullTriangle, "#version 300 es\n" . str_replace('DECLARATION', 'layout(std140) uniform Palette {vec4 colors[64];};', $body));
$locations = [];
for($index = 0; $index < 64; $index++) { $locations[] = glGetUniformLocation($program, 'colors[' . $index . ']'); }
$palettes = $packed = $expected = [];
foreach([0, 1] as $flip)
{
	$row = '';
	$palettes[$flip] = [];
	for($index = 0; $index < 64; $index++)
	{
		$red = ($index + $flip) % 2;
		array_push($palettes[$flip], $red, 1-$red, 0, 1);
		$row .= $red ? "\xff\0\0\xff" : "\0\xff\0\xff";
	}
	$packed[$flip] = pack('g*', ...$palettes[$flip]);
	$expected[$flip] = str_repeat($row, 256);
}
$block = glGetUniformBlockIndex($uboProgram, 'Palette');
perfCheck(glGetActiveUniformBlockiv($uboProgram, $block, GL_UNIFORM_BLOCK_DATA_SIZE) === 1024, 'Unexpected palette layout');
glUniformBlockBinding($uboProgram, $block, 0);
glGenBuffers(1, $buffers);
glBindBuffer(GL_UNIFORM_BUFFER, $buffers[0]);
glBufferData(GL_UNIFORM_BUFFER, 1024, null, GL_DYNAMIC_DRAW);
glBindBufferBase(GL_UNIFORM_BUFFER, 0, $buffers[0]);
$updates = [
	'scalar_uniforms' => function($flip) use ($palettes, $locations) {
		foreach($locations as $index => $location)
		{
			$base = $index * 4;
			glUniform4f($location, $palettes[$flip][$base], $palettes[$flip][$base+1], 0, 1);
		}
	}
	, 'uniform_array' => function($flip) use ($palettes, $locations) { glUniform4fv($locations[0], 64, $palettes[$flip]); }
	, 'uniform_buffer' => function($flip) use ($packed) { glBufferSubData(GL_UNIFORM_BUFFER, 0, 1024, $packed[$flip]); }
];
foreach($updates as $name => $update)
{
	$selected = $name === 'uniform_buffer' ? $uboProgram : $program;
	$cases[$name] = [
		'batches' => 128, 'itemsPerBatch' => 64, 'callsPerBatch' => $name === 'scalar_uniforms' ? 65 : 2
		, 'bytesPerBatch' => 1024
		, 'prepare' => function() use ($clear, $selected, $update, $read, $expected) {
			glUseProgram($selected); $update(0); glDrawArrays(GL_TRIANGLES, 0, 3);
			perfCheck($read() === $expected[0], 'Uniform sample did not start with the opposite palette');
			$clear();
		}
		, 'submit' => function($batch) use ($update) { $update($batch % 2); glDrawArrays(GL_TRIANGLES, 0, 3); }
		, 'finish' => $read
		, 'verify' => function($pixels) use ($expected) {
			perfCheck(glGetError() === GL_NO_ERROR, 'Uniform GL error');
			perfCheck($pixels === $expected[1], 'Uniform updates did not render all palette entries');
		}
	];
}
$cleanup = function() use ($program, $uboProgram, $buffers, $context, $window) {
	glBindBufferBase(GL_UNIFORM_BUFFER, 0, 0); glDeleteBuffers(1, $buffers);
	glUseProgram(0); glDeleteProgram($program); glDeleteProgram($uboProgram);
	SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
};
