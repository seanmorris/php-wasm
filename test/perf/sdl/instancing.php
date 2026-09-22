<?php

[$window, $context] = perfContext();
$program = perfProgram('#version 300 es
layout(location=0) in vec2 position;
layout(location=1) in vec2 instanceOffset;
uniform vec2 offset;
void main() { gl_Position = vec4(position+instanceOffset+offset,0,1); }',
'#version 300 es
precision highp float;out vec4 color;void main(){color=vec4(1);}');
glUseProgram($program);
$offsetLocation = glGetUniformLocation($program, 'offset');
$offsets = [];
$packedOffsets = '';
for($y = 0; $y < 32; $y++)
{
	for($x = 0; $x < 32; $x++)
	{
		$offsets[] = [$x / 16 - 1, $y / 16 - 1];
		$packedOffsets .= pack('g*', $x / 16 - 1, $y / 16 - 1);
	}
}
glGenVertexArrays(1, $vaos);
glBindVertexArray($vaos[0]);
glGenBuffers(3, $buffers);
glBindBuffer(GL_ARRAY_BUFFER, $buffers[0]);
$vertices = pack('g*', 0, 0, 1/16, 0, 0, 1/16);
glBufferData(GL_ARRAY_BUFFER, strlen($vertices), $vertices, GL_STATIC_DRAW);
glVertexAttribPointer(0, 2, GL_FLOAT, false, 0, 0);
glEnableVertexAttribArray(0);
glBindBuffer(GL_ARRAY_BUFFER, $buffers[1]);
glBufferData(GL_ARRAY_BUFFER, strlen($packedOffsets), $packedOffsets, GL_STATIC_DRAW);
glVertexAttribPointer(1, 2, GL_FLOAT, false, 0, 0);
glVertexAttribDivisor(1, 1);
glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, $buffers[2]);
glBufferData(GL_ELEMENT_ARRAY_BUFFER, 6, pack('v*', 0, 1, 2), GL_STATIC_DRAW);

$draws = [
	'arrays' => function() { glDrawArrays(GL_TRIANGLES, 0, 3); }
	, 'indexed' => function() { glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_SHORT, 0); }
];
$instanced = [
	'arrays' => function() { glDrawArraysInstanced(GL_TRIANGLES, 0, 3, 1024); }
	, 'indexed' => function() { glDrawElementsInstanced(GL_TRIANGLES, 3, GL_UNSIGNED_SHORT, 0, 1024); }
];
$reference = null;
$verify = function($pixels) use (&$reference) {
	perfCheck(glGetError() === GL_NO_ERROR, 'Instancing GL error');
	if($reference === null)
	{
		perfCheck(substr_count($pixels, "\xff\xff\xff\xff") >= 3072, 'Triangles were not drawn');
		perfCheck(substr_count($pixels, "\0\0\0\xff") >= 4096, 'Triangle spacing was lost');
		$reference = $pixels;
	}
	perfCheck($pixels === $reference, 'Ordinary and instanced framebuffers differ');
};
foreach($draws as $kind => $draw)
{
	$cases['ordinary_' . $kind] = [
		'batches' => 32, 'itemsPerBatch' => 1024, 'callsPerBatch' => 2048, 'bytesPerBatch' => 8192
		, 'prepare' => function() use ($clear) { glDisableVertexAttribArray(1); $clear(); }
		, 'submit' => function() use ($offsets, $offsetLocation, $draw) {
			foreach($offsets as [$x, $y]) { glUniform2f($offsetLocation, $x, $y); $draw(); }
		}
		, 'finish' => $read, 'verify' => $verify
	];
	$cases['instanced_' . $kind] = [
		'batches' => 32, 'itemsPerBatch' => 1024, 'callsPerBatch' => 1, 'bytesPerBatch' => 0
		, 'prepare' => function() use ($clear, $offsetLocation) {
			glEnableVertexAttribArray(1); glUniform2f($offsetLocation, 0, 0); $clear();
		}
		, 'submit' => $instanced[$kind], 'finish' => $read, 'verify' => $verify
	];
}
$cleanup = function() use ($program, $buffers, $vaos, $context, $window) {
	glBindVertexArray(0); glDeleteVertexArrays(1, $vaos); glDeleteBuffers(3, $buffers);
	glUseProgram(0); glDeleteProgram($program);
	SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
};
