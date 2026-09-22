<?php

[$window, $context] = perfContext();
$program = perfProgram($fullTriangle, '#version 300 es
precision highp float;uniform sampler2D image;out vec4 color;
void main(){color=texture(image,gl_FragCoord.xy/128.0);}');
glUseProgram($program);
glGenTextures(1, $textures);
glBindTexture(GL_TEXTURE_2D, $textures[0]);
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 256, 256, 0, GL_RGBA, GL_UNSIGNED_BYTE, null);
$pixels = [str_repeat("\xff\0\0\xff", 65536), str_repeat("\0\xff\0\xff", 65536)];
$expected = str_repeat("\0\xff\0\xff", 16384);
$uploads = [
	'tex_image' => function($bytes) { glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 256, 256, 0, GL_RGBA, GL_UNSIGNED_BYTE, $bytes); }
	, 'tex_sub_image' => function($bytes) { glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 256, 256, GL_RGBA, GL_UNSIGNED_BYTE, $bytes); }
];
foreach($uploads as $name => $upload)
{
	$cases[$name] = [
		'batches' => 64, 'itemsPerBatch' => 1, 'callsPerBatch' => 2, 'bytesPerBatch' => 262144
		, 'prepare' => function() use ($pixels, $clear, $read) {
			glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 256, 256, 0, GL_RGBA, GL_UNSIGNED_BYTE, $pixels[0]);
			glDrawArrays(GL_TRIANGLES, 0, 3);
			perfCheck($read() === str_repeat("\xff\0\0\xff", 16384), 'Texture sample did not start red');
			$clear();
		}
		, 'submit' => function($batch) use ($upload, $pixels) { $upload($pixels[$batch % 2]); glDrawArrays(GL_TRIANGLES, 0, 3); }
		, 'finish' => $read
		, 'verify' => function($result) use ($expected) {
			perfCheck(glGetError() === GL_NO_ERROR, 'Texture GL error');
			perfCheck($result === $expected, 'Streamed GL texture pixels differ');
		}
	];
}
$cleanup = function() use ($textures, $program, $context, $window) {
	glDeleteTextures(1, $textures); glUseProgram(0); glDeleteProgram($program);
	SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
};
