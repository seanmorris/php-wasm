<?php

[$window, $context] = perfContext();
$vertex = str_replace('vec4(p[gl_VertexID],0,1)', 'vec4(p[gl_VertexID],depth,1)',
	str_replace('void main()', 'uniform float depth;void main()', $fullTriangle));
$program = perfProgram($vertex, '#version 300 es
precision highp float;uniform vec4 shade;
layout(location=0) out vec4 first;layout(location=1) out vec4 second;
void main(){first=shade;second=vec4(vec3(1)-shade.rgb,1);}');
glUseProgram($program);
$shade = glGetUniformLocation($program, 'shade');
$depth = glGetUniformLocation($program, 'depth');
glEnable(GL_DEPTH_TEST); glDepthFunc(GL_LESS); glClearDepth(1);
glGenFramebuffers(3, $fbos); glGenTextures(3, $textures); glGenRenderbuffers(3, $buffers);
foreach($textures as $index => $texture)
{
	glBindTexture(GL_TEXTURE_2D, $texture);
	glTexStorage2D(GL_TEXTURE_2D, 1, GL_RGBA8, 128, 128);
	glBindFramebuffer(GL_FRAMEBUFFER, $fbos[$index === 2 ? 2 : 0]);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + ($index === 1 ? 1 : 0), GL_TEXTURE_2D, $texture, 0);
}
glBindFramebuffer(GL_FRAMEBUFFER, $fbos[0]);
glBindRenderbuffer(GL_RENDERBUFFER, $buffers[0]);
glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, 128, 128);
glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, $buffers[0]);
$supported = array_intersect(glGetInternalformativ(GL_RENDERBUFFER, GL_RGBA8, GL_SAMPLES),
	glGetInternalformativ(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, GL_SAMPLES));
perfCheck(count($supported) > 0, 'No matching multisample color/depth format');
$samples = min(4, max($supported));
perfCheck(in_array($samples, $supported, true), 'Four-or-fewer sample target unavailable');
glBindFramebuffer(GL_FRAMEBUFFER, $fbos[1]);
foreach([[1, GL_RGBA8, GL_COLOR_ATTACHMENT0], [2, GL_DEPTH24_STENCIL8, GL_DEPTH_STENCIL_ATTACHMENT]] as [$index, $format, $attachment])
{
	glBindRenderbuffer(GL_RENDERBUFFER, $buffers[$index]);
	glRenderbufferStorageMultisample(GL_RENDERBUFFER, $samples, $format, 128, 128);
	glFramebufferRenderbuffer(GL_FRAMEBUFFER, $attachment, GL_RENDERBUFFER, $buffers[$index]);
}
foreach($fbos as $fbo)
{
	glBindFramebuffer(GL_FRAMEBUFFER, $fbo);
	perfCheck(glCheckFramebufferStatus(GL_FRAMEBUFFER) === GL_FRAMEBUFFER_COMPLETE, 'Incomplete target');
}
$colors = [str_repeat("\0\xff\0\xff", 16384), str_repeat("\xff\0\0\xff", 16384)];
$inverse = [str_repeat("\xff\0\xff\xff", 16384), str_repeat("\0\xff\xff\xff", 16384)];
foreach(['depth', 'mrt_depth', 'msaa_resolve'] as $name)
{
	$mrt = $name === 'mrt_depth'; $msaa = $name === 'msaa_resolve';
	$submit = function($batch) use ($fbos, $shade, $depth, $msaa) {
		glBindFramebuffer(GL_FRAMEBUFFER, $fbos[$msaa ? 1 : 0]);
		glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
		glUniform1f($depth, -.5); glUniform4f($shade, $batch % 2, 1 - $batch % 2, 0, 1);
		glDrawArrays(GL_TRIANGLES, 0, 3);
		glUniform1f($depth, .5); glUniform4f($shade, 0, 0, 1, 1);
		glDrawArrays(GL_TRIANGLES, 0, 3);
		if($msaa) {
			glBindFramebuffer(GL_DRAW_FRAMEBUFFER, $fbos[2]);
			glBlitFramebuffer(0, 0, 128, 128, 0, 0, 128, 128, GL_COLOR_BUFFER_BIT, GL_NEAREST);
		}
	};
	$finish = function() use ($fbos, $mrt, $msaa, $read) {
		glBindFramebuffer(GL_READ_FRAMEBUFFER, $fbos[$msaa ? 2 : 0]);
		glReadBuffer(GL_COLOR_ATTACHMENT0); $first = $read();
		$second = null;
		if($mrt) { glReadBuffer(GL_COLOR_ATTACHMENT1); $second = $read(); }
		return [$first, $second];
	};
	$verify = function($result, $color = 1) use ($colors, $inverse, $mrt) {
		perfCheck(glGetError() === GL_NO_ERROR, 'Target GL error');
		perfCheck($result === [$colors[$color], $mrt ? $inverse[$color] : null], 'Depth/MRT/resolve pixels differ');
	};
	$cases[$name] = [
		'batches' => 1024, 'itemsPerBatch' => 1, 'callsPerBatch' => $msaa ? 10 : 8
		, 'samples' => $msaa ? $samples : 1
		, 'prepare' => function() use ($fbos, $mrt, $msaa, $submit, $finish, $verify) {
			glBindFramebuffer(GL_FRAMEBUFFER, $fbos[$msaa ? 1 : 0]);
			glDrawBuffers($mrt ? 2 : 1, $mrt ? [GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1] : [GL_COLOR_ATTACHMENT0]);
			// Verify the opposite starting frame, then require timed draws/resolve
			// to replace every pixel; a stale final frame must not pass.
			$submit(0); $verify($finish(), 0);
		}
		, 'submit' => $submit, 'finish' => $finish, 'verify' => $verify
	];
}
$cleanup = function() use ($fbos, $textures, $buffers, $program, $context, $window) {
	glBindFramebuffer(GL_FRAMEBUFFER, 0);
	glDeleteFramebuffers(3, $fbos); glDeleteTextures(3, $textures); glDeleteRenderbuffers(3, $buffers);
	glUseProgram(0); glDeleteProgram($program);
	SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();
};
