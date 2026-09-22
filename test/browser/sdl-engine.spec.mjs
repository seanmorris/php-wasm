import {test, expect} from '@playwright/test';
import {start, run, rejectHelper} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const context = String.raw`
SDL_Init(SDL_INIT_VIDEO);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);
$window = SDL_CreateWindow('Engine bindings',0,0,64,64,SDL_WINDOW_OPENGL);
$context = SDL_GL_CreateContext($window);
if(!$context || SDL_GL_MakeCurrent($window,$context) !== 0) { throw new RuntimeException(SDL_GetError()); }
glViewport(0,0,64,64);
glDisable(GL_DITHER);
$programFrom = function($vertex, $fragment) {
	$program = glCreateProgram();
	foreach([[GL_VERTEX_SHADER,$vertex],[GL_FRAGMENT_SHADER,$fragment]] as [$type,$source]) {
		$shader = glCreateShader($type); glShaderSource($shader,1,$source); glCompileShader($shader);
		if(!glGetShaderiv($shader,GL_COMPILE_STATUS)) { throw new RuntimeException(glGetShaderInfoLog($shader)); }
		glAttachShader($program,$shader); glDeleteShader($shader);
	}
	glLinkProgram($program);
	if(!glGetProgramiv($program,GL_LINK_STATUS)) { throw new RuntimeException(glGetProgramInfoLog($program)); }
	return $program;
};
$pixel = function($x=32,$y=32) { return bin2hex(glReadPixels($x,$y,1,1,GL_RGBA,GL_UNSIGNED_BYTE)); };
`;

const cleanup = `SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();`;
const triangle = `#version 300 es
uniform float depth;
void main() {
	vec2 positions[3] = vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
	gl_Position = vec4(positions[gl_VertexID],depth,1);
}`;

test('instanced array and indexed draws consume integer per-instance attributes', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${context}${rejectHelper}
	$vertex = '#version 300 es
	layout(location=0) in vec2 position;
	layout(location=1) in vec2 offset;
	layout(location=2) in uvec4 tint;
	flat out vec4 color;
	void main(){gl_Position=vec4(position+offset,0,1);color=vec4(tint)/255.0;}';
	$fragment = '#version 300 es
	precision highp float;flat in vec4 color;out vec4 outputColor;
	void main(){outputColor=color;}';
	$program = $programFrom($vertex,$fragment); glUseProgram($program);
	glGenVertexArrays(1,$vaos); glBindVertexArray($vaos[0]);
	glGenBuffers(4,$buffers);
	foreach([
		[0,pack('f*',-.3,-.6,.3,-.6,0,.6),2,GL_FLOAT,0],
		[1,pack('f*',-.5,0,.5,0),2,GL_FLOAT,1],
		[2,"\x00\x00\x00\x00\xff\x00\x00\xff\x00\xff\x00\xff",4,GL_UNSIGNED_BYTE,1]
	] as [$index,$bytes,$size,$type,$divisor]) {
		glBindBuffer(GL_ARRAY_BUFFER,$buffers[$index]);
		// Configuring a layout before buffer allocation is legal, even with a nonzero offset.
		if($index === 2) { glVertexAttribIPointer($index,$size,$type,0,4); }
		else { glVertexAttribPointer($index,$size,$type,false,0,0); }
		glEnableVertexAttribArray($index); glVertexAttribDivisor($index,$divisor);
		glBufferData(GL_ARRAY_BUFFER,strlen($bytes),$bytes,GL_STATIC_DRAW);
	}
	glClearColor(0,0,0,1); glClear(GL_COLOR_BUFFER_BIT);
	glDrawArraysInstanced(GL_TRIANGLES,0,3,2);
	$arrays = [$pixel(16,32),$pixel(48,32),$pixel(32,32)];
	glBindBuffer(GL_ELEMENT_ARRAY_BUFFER,$buffers[3]);
	$indices = pack('v*',0,1,2); glBufferData(GL_ELEMENT_ARRAY_BUFFER,6,$indices,GL_STATIC_DRAW);
	glClear(GL_COLOR_BUFFER_BIT); glDrawElementsInstanced(GL_TRIANGLES,3,GL_UNSIGNED_SHORT,0,2);
	$indexed = [$pixel(16,32),$pixel(48,32)];
	glDrawArraysInstanced(GL_TRIANGLES,0,0,2); glDrawArraysInstanced(GL_TRIANGLES,0,3,0);
	glDrawElementsInstanced(GL_TRIANGLES,0,GL_UNSIGNED_SHORT,0,2);
	glDrawElementsInstanced(GL_TRIANGLES,3,GL_UNSIGNED_SHORT,0,0);
	$attributes = [];
	for($i=0;$i<glGetProgramiv($program,GL_ACTIVE_ATTRIBUTES);$i++) { $attributes[] = glGetActiveAttrib($program,$i); }
	$reject('stride',function(){glVertexAttribIPointer(2,4,GL_UNSIGNED_BYTE,256,0);});
	$reject('alignment',function(){glVertexAttribIPointer(2,2,GL_UNSIGNED_SHORT,0,1);});
	$reject('integer-type',function(){glVertexAttribIPointer(2,2,GL_FLOAT,0,0);});
	$reject('attribute-range',function(){glVertexAttribIPointer(glGetIntegerv(GL_MAX_VERTEX_ATTRIBS),4,GL_UNSIGNED_BYTE,0,0);});
	$reject('divisor',function(){glVertexAttribDivisor(1,-1);});
	$reject('instances',function(){glDrawArraysInstanced(GL_TRIANGLES,0,3,-1);});
	$reject('indices',function(){glDrawElementsInstanced(GL_TRIANGLES,4,GL_UNSIGNED_SHORT,0,2);});
	$reject('index-alignment',function(){glDrawElementsInstanced(GL_TRIANGLES,1,GL_UNSIGNED_SHORT,1,2);});
	glVertexAttribIPointer(2,4,GL_UNSIGNED_BYTE,0,100);
	glDrawArraysInstanced(GL_TRIANGLES,0,3,2);
	$fetchError=glGetError();
	glBindBuffer(GL_ARRAY_BUFFER,0);
	$reject('unbound',function(){glVertexAttribPointer(0,2,GL_FLOAT,false,0,0);});
	$live = [glIsProgram($program),glIsVertexArray($vaos[0]),glIsBuffer($buffers[0])];
	glBindVertexArray(0); glDeleteVertexArrays(1,$vaos); glDeleteBuffers(4,$buffers);
	glUseProgram(0); glDeleteProgram($program);
	$deleted = [glIsProgram($program),glIsVertexArray($vaos[0]),glIsBuffer($buffers[0])];
	$error = glGetError(); ${cleanup}
	echo json_encode(compact('arrays','indexed','attributes','live','deleted','fetchError','rejected','error'));
	`);
	expect(result.arrays).toEqual(['ff0000ff', '00ff00ff', '000000ff']);
	expect(result.indexed).toEqual(['ff0000ff', '00ff00ff']);
	expect(result.attributes.map(({name}) => name).sort()).toEqual(['offset', 'position', 'tint']);
	expect(result.live).toEqual([true, true, true]);
	expect(result.deleted).toEqual([false, false, false]);
	// WebGL permits INVALID_OPERATION or robust bounded fetches for vertex ranges.
	// https://registry.khronos.org/webgl/specs/latest/1.0/#4.1
	expect([0, 1282]).toContain(result.fetchError);
	expect(result.rejected).toEqual(['stride', 'alignment', 'integer-type', 'attribute-range', 'divisor', 'instances', 'indices', 'index-alignment', 'unbound']);
	expect(result.error).toBe(0);
});

test('uniform blocks use reflected layouts across programs and buffer ranges', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${context}${rejectHelper}
	$fragment = '#version 300 es
	precision highp float;
	layout(std140) uniform Scene {vec4 tint;mat4 basis;vec4 tones[2];};
	out vec4 outputColor;
	void main(){outputColor=(tint*basis[0][0]+tones[0]+tones[1])SWIZZLE;}';
	$programs = [
		$programFrom(${JSON.stringify(triangle)},str_replace('SWIZZLE','',$fragment)),
		$programFrom(${JSON.stringify(triangle)},str_replace('SWIZZLE','.bgra',$fragment))
	];
	$program = $programs[0];
	$block = glGetUniformBlockIndex($program,'Scene');
	$blockName = glGetActiveUniformBlockName($program,$block);
	$blockSize = glGetActiveUniformBlockiv($program,$block,GL_UNIFORM_BLOCK_DATA_SIZE);
	$active = glGetActiveUniformBlockiv($program,$block,GL_UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES);
	$symbols = [];
	foreach($active as $index) {
		$symbol = glGetActiveUniform($program,$index);
		$symbols[preg_replace('/^.*\./','',$symbol['name'])] = $symbol;
	}
	$names = array_map(function($name) use ($symbols) {return $symbols[$name]['name'];},['tint','basis','tones[0]']);
	$indices = glGetUniformIndices($program,$names);
	$offsets = glGetActiveUniformsiv($program,$indices,GL_UNIFORM_OFFSET);
	$matrixStrides = glGetActiveUniformsiv($program,$indices,GL_UNIFORM_MATRIX_STRIDE);
	$arrayStrides = glGetActiveUniformsiv($program,$indices,GL_UNIFORM_ARRAY_STRIDE);
	$nameLengths = glGetActiveUniformsiv($program,$indices,GL_UNIFORM_NAME_LENGTH);
	$missing = [glGetUniformBlockIndex($program,'missing'),glGetUniformIndices($program,['missing'])[0],GL_INVALID_INDEX];
	$alignment = glGetIntegerv(GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT);
	$stride = intdiv($blockSize+$alignment-1,$alignment)*$alignment;
	$makeBlock = function($color) use ($blockSize,$offsets,$matrixStrides) {
		$data = str_repeat("\0",$blockSize);
		$data = substr_replace($data,pack('f*',...$color),$offsets[0],16);
		for($column=0;$column<4;$column++) {
			$values=[0,0,0,0]; $values[$column]=1;
			$data=substr_replace($data,pack('f*',...$values),$offsets[1]+$column*$matrixStrides[1],16);
		}
		return $data;
	};
	$data = str_pad($makeBlock([1,0,0,1]),$stride,"\0").$makeBlock([0,1,0,1]);
	glGenBuffers(1,$buffers); glBindBuffer(GL_UNIFORM_BUFFER,$buffers[0]);
	glBufferData(GL_UNIFORM_BUFFER,strlen($data),$data,GL_DYNAMIC_DRAW);
	$bufferSize = glGetBufferParameteriv(GL_UNIFORM_BUFFER,GL_BUFFER_SIZE);
	glBindBufferBase(GL_UNIFORM_BUFFER,0,$buffers[0]);
	$colors = [];
	foreach($programs as $candidate) {
		glUniformBlockBinding($candidate,glGetUniformBlockIndex($candidate,'Scene'),0);
		glUseProgram($candidate); glDrawArrays(GL_TRIANGLES,0,3); $colors[]=$pixel();
	}
	glBindBufferRange(GL_UNIFORM_BUFFER,0,$buffers[0],$stride,$blockSize);
	$range = [glGetIntegeri_v(GL_UNIFORM_BUFFER_BINDING,0),glGetIntegeri_v(GL_UNIFORM_BUFFER_START,0),glGetIntegeri_v(GL_UNIFORM_BUFFER_SIZE,0)];
	foreach($programs as $candidate) {glUseProgram($candidate);glDrawArrays(GL_TRIANGLES,0,3);$colors[]=$pixel();}
	glBindBuffer(GL_COPY_READ_BUFFER,$buffers[0]); glBindBuffer(GL_COPY_WRITE_BUFFER,$buffers[0]);
	glCopyBufferSubData(GL_COPY_READ_BUFFER,GL_COPY_WRITE_BUFFER,$stride,0,$blockSize);
	glBindBufferRange(GL_UNIFORM_BUFFER,0,$buffers[0],0,$blockSize);
	glDrawArrays(GL_TRIANGLES,0,3); $colors[]=$pixel();
	$reject('range-alignment',function() use ($buffers,$blockSize){glBindBufferRange(GL_UNIFORM_BUFFER,0,$buffers[0],1,$blockSize);});
	$reject('range-size',function() use ($buffers,$blockSize,$stride){glBindBufferRange(GL_UNIFORM_BUFFER,0,$buffers[0],$stride,$blockSize+1);});
	$reject('overlap',function() use ($blockSize){glCopyBufferSubData(GL_COPY_READ_BUFFER,GL_COPY_WRITE_BUFFER,0,4,$blockSize);});
	$reject('copy-size',function(){glCopyBufferSubData(GL_COPY_READ_BUFFER,GL_COPY_WRITE_BUFFER,0,0,99999);});
	$reject('index',function() use ($program){glGetActiveUniformsiv($program,[-1],GL_UNIFORM_OFFSET);});
	$reject('query',function() use ($program,$indices){glGetActiveUniformsiv($program,$indices,GL_VIEWPORT);});
	$reject('block',function() use ($program){glUniformBlockBinding($program,99,0);});
	$reject('symbol',function() use ($program){glGetUniformIndices($program,["tint\0bad"]);});
	$reject('program',function(){glGetActiveUniform(999999,0);});
	glBindBufferBase(GL_UNIFORM_BUFFER,0,0); glDeleteBuffers(1,$buffers);
	$reject('deleted-buffer',function() use ($buffers){glBindBufferBase(GL_UNIFORM_BUFFER,0,$buffers[0]);});
	glUseProgram(0); foreach($programs as $candidate) {glDeleteProgram($candidate);}
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('blockName','blockSize','names','offsets','matrixStrides','arrayStrides','nameLengths','missing','stride','bufferSize','range','colors','rejected','error')+['buffer'=>$buffers[0]]);
	`);
	expect(result.blockName).toBe('Scene');
	expect(result.blockSize).toBe(112);
	expect(result.offsets).toEqual([0, 16, 80]);
	expect(result.matrixStrides).toEqual([0, 16, 0]);
	expect(result.arrayStrides).toEqual([0, 0, 16]);
	expect(result.nameLengths).toEqual(result.names.map(name => name.length + 1));
	expect(result.missing).toEqual([-1, -1, -1]);
	expect(result.bufferSize).toBe(result.stride + result.blockSize);
	expect(result.range).toEqual([result.buffer, result.stride, result.blockSize]);
	expect(result.colors).toEqual(['ff0000ff', '0000ffff', '00ff00ff', '00ff00ff', '00ff00ff']);
	expect(result.rejected).toEqual(['range-alignment', 'range-size', 'overlap', 'copy-size', 'index', 'query', 'block', 'symbol', 'program', 'deleted-buffer']);
	expect(result.error).toBe(0);
});

test('unsigned scalar and vector uniforms preserve all uint32 bits', async ({page}) => {
	await start(page);
	const declarations = [1, 2, 3, 4].map(size => `uniform ${size === 1 ? 'uint' : `uvec${size}`} values${size}[2];`).join('\n');
	const terms = [1, 2, 3, 4].flatMap(size => [0, 1].map(index => `float(values${size}[${index}]${size > 1 ? '.x' : ''})`));
	const vertex = `#version 300 es\n${declarations}\nvoid main(){gl_Position=vec4((${terms.join('+')})*1e-12,0,0,1);}`;
	const fragment = '#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1);}';
	const setters = [1, 2, 3, 4].map(size => `
	glUniform${size}uiv(glGetUniformLocation($program,'values${size}'),2,[${Array(size * 2).fill("'4294967295'").join(',')}]);
	glUniform${size}ui(glGetUniformLocation($program,'values${size}[0]'),${Array(size).fill("'2147483648'").join(',')});`).join('\n');
	const result = await run(page, String.raw`${context}${rejectHelper}
	$program=$programFrom(${JSON.stringify(vertex)},${JSON.stringify(fragment)}); glUseProgram($program);
	${setters}
	$reject('overflow',function(){glUniform1ui(-1,'4294967296');});
	$reject('negative',function(){glUniform1ui(-1,-1);});
	$reject('fraction',function(){glUniform1uiv(-1,1,[.5]);});
	$reject('empty',function(){glUniform1ui(-1,'');});
	$reject('nul',function(){glUniform1ui(-1,"1\0");});
	$reject('count',function(){glUniform3uiv(-1,1,[1,2]);});
	glUniform1uiv(-1,0,[]);
	echo json_encode(['error'=>glGetError(),'rejected'=>$rejected]);
	`);
	expect(result).toEqual({error: 0, rejected: ['overflow', 'negative', 'fraction', 'empty', 'nul', 'count']});
	const values = await page.evaluate(() => {
		const gl = document.querySelector('canvas').getContext('webgl2');
		const program = gl.getParameter(gl.CURRENT_PROGRAM);
		return [1, 2, 3, 4].map(size => [0, 1].map(index => {
			const value = gl.getUniform(program, gl.getUniformLocation(program, `values${size}[${index}]`));
			return ArrayBuffer.isView(value) ? [...value] : [value];
		}));
	});
	for(const size of [1, 2, 3, 4])
	{
		expect(values[size - 1]).toEqual([Array(size).fill(2147483648), Array(size).fill(4294967295)]);
	}
	await run(page, `glUseProgram(0); glDeleteProgram($program); ${cleanup}`);
});

test('renderbuffers provide depth, stencil, MRT and multisample resolve', async ({page}) => {
	await start(page);
	const fragment = '#version 300 es\nprecision highp float;uniform vec4 shade;layout(location=0) out vec4 a;layout(location=1) out vec4 b;void main(){a=shade;b=shade.bgra;}';
	const result = await run(page, String.raw`${context}${rejectHelper}
	$program=$programFrom(${JSON.stringify(triangle)},${JSON.stringify(fragment)});glUseProgram($program);
	$shade=glGetUniformLocation($program,'shade');$depth=glGetUniformLocation($program,'depth');
	glViewport(0,0,8,8);
	glGenFramebuffers(2,$fbos); glBindFramebuffer(GL_FRAMEBUFFER,$fbos[0]);
	$incomplete=glCheckFramebufferStatus(GL_FRAMEBUFFER)!==GL_FRAMEBUFFER_COMPLETE;
	glGenTextures(2,$textures);
	foreach($textures as $index=>$texture) {
		glBindTexture(GL_TEXTURE_2D,$texture);
		glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,8,8,0,GL_RGBA,GL_UNSIGNED_BYTE,null);
		glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
		glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
		glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0+$index,GL_TEXTURE_2D,$texture,0);
	}
	glGenRenderbuffers(2,$renderbuffers); glBindRenderbuffer(GL_RENDERBUFFER,$renderbuffers[0]);
	glRenderbufferStorage(GL_RENDERBUFFER,GL_DEPTH24_STENCIL8,8,8);
	glFramebufferRenderbuffer(GL_FRAMEBUFFER,GL_DEPTH_STENCIL_ATTACHMENT,GL_RENDERBUFFER,$renderbuffers[0]);
	glDrawBuffers(2,[GL_COLOR_ATTACHMENT0,GL_COLOR_ATTACHMENT1]);
	$complete=glCheckFramebufferStatus(GL_FRAMEBUFFER)===GL_FRAMEBUFFER_COMPLETE;
	$dimensions=[glGetRenderbufferParameteriv(GL_RENDERBUFFER,GL_RENDERBUFFER_WIDTH),glGetRenderbufferParameteriv(GL_RENDERBUFFER,GL_RENDERBUFFER_HEIGHT)];
	$attachment=glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER,GL_DEPTH_STENCIL_ATTACHMENT,GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
	glClearColor(0,0,0,1);glClearDepth(1);glClearStencil(0);
	glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT|GL_STENCIL_BUFFER_BIT);
	glEnable(GL_DEPTH_TEST);glDepthFunc(GL_LESS);glEnable(GL_STENCIL_TEST);
	glStencilFunc(GL_ALWAYS,1,255);glStencilOp(GL_KEEP,GL_KEEP,GL_REPLACE);
	glUniform1f($depth,-.5);glUniform4f($shade,1,0,0,1);glDrawArrays(GL_TRIANGLES,0,3);
	glUniform1f($depth,.5);glUniform4f($shade,0,1,0,1);glDrawArrays(GL_TRIANGLES,0,3);
	glReadBuffer(GL_COLOR_ATTACHMENT0);$front=$pixel(4,4);
	glReadBuffer(GL_COLOR_ATTACHMENT1);$second=$pixel(4,4);
	glReadBuffer(GL_COLOR_ATTACHMENT0);glClear(GL_COLOR_BUFFER_BIT);glDisable(GL_DEPTH_TEST);
	glStencilFunc(GL_EQUAL,2,255);glStencilOp(GL_KEEP,GL_KEEP,GL_KEEP);glDrawArrays(GL_TRIANGLES,0,3);$blocked=$pixel(4,4);
	glStencilFunc(GL_EQUAL,1,255);glDrawArrays(GL_TRIANGLES,0,3);$passed=$pixel(4,4);
	glDisable(GL_STENCIL_TEST);
	$cycles=[];
	foreach([16,4,8] as $size) {
		foreach($textures as $texture) {glBindTexture(GL_TEXTURE_2D,$texture);glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,$size,$size,0,GL_RGBA,GL_UNSIGNED_BYTE,null);}
		glRenderbufferStorage(GL_RENDERBUFFER,GL_DEPTH24_STENCIL8,$size,$size);
		$cycles[]=glCheckFramebufferStatus(GL_FRAMEBUFFER)===GL_FRAMEBUFFER_COMPLETE;
	}
	$samples=glGetInternalformativ(GL_RENDERBUFFER,GL_RGBA8,GL_SAMPLES);
	$sampleCount=glGetInternalformativ(GL_RENDERBUFFER,GL_RGBA8,GL_NUM_SAMPLE_COUNTS);
	glBindFramebuffer(GL_FRAMEBUFFER,$fbos[1]);glBindRenderbuffer(GL_RENDERBUFFER,$renderbuffers[1]);
	glRenderbufferStorageMultisample(GL_RENDERBUFFER,$samples[0],GL_RGBA8,8,8);
	glFramebufferRenderbuffer(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_RENDERBUFFER,$renderbuffers[1]);
	glDrawBuffers(1,[GL_COLOR_ATTACHMENT0]);
	$multisample=glCheckFramebufferStatus(GL_FRAMEBUFFER)===GL_FRAMEBUFFER_COMPLETE;
	$actualSamples=glGetRenderbufferParameteriv(GL_RENDERBUFFER,GL_RENDERBUFFER_SAMPLES);
	glClearColor(0,0,1,1);glClear(GL_COLOR_BUFFER_BIT);
	glBindFramebuffer(GL_DRAW_FRAMEBUFFER,$fbos[0]);glDrawBuffers(1,[GL_COLOR_ATTACHMENT0]);
	glBlitFramebuffer(0,0,8,8,0,0,8,8,GL_COLOR_BUFFER_BIT,GL_NEAREST);
	glBindFramebuffer(GL_READ_FRAMEBUFFER,$fbos[0]);glReadBuffer(GL_COLOR_ATTACHMENT0);$resolved=$pixel(4,4);
	$reject('sample-limit',function(){glRenderbufferStorageMultisample(GL_RENDERBUFFER,glGetIntegerv(GL_MAX_SAMPLES)+1,GL_RGBA8,8,8);});
	$reject('dimensions',function(){glRenderbufferStorage(GL_RENDERBUFFER,GL_RGBA8,-1,8);});
	$reject('blit-filter',function(){glBlitFramebuffer(0,0,8,8,0,0,8,8,GL_DEPTH_BUFFER_BIT,GL_LINEAR);});
	$reject('draw-count',function(){glDrawBuffers(2,[GL_COLOR_ATTACHMENT0]);});
	$reject('attachment-query',function(){glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_VIEWPORT);});
	glBindFramebuffer(GL_FRAMEBUFFER,0);glDeleteFramebuffers(2,$fbos);glDeleteRenderbuffers(2,$renderbuffers);glDeleteTextures(2,$textures);
	glDeleteRenderbuffers(2,$renderbuffers);
	$deleted=!glIsRenderbuffer($renderbuffers[0])&&!glIsFramebuffer($fbos[0])&&!glIsTexture($textures[0]);
	glUseProgram(0);glDeleteProgram($program);$error=glGetError();${cleanup}
	echo json_encode(compact('incomplete','complete','dimensions','attachment','front','second','blocked','passed','cycles','samples','sampleCount','actualSamples','multisample','resolved','deleted','rejected','error')+['depthBuffer'=>$renderbuffers[0]]);
	`);
	expect(result.incomplete).toBe(true);
	expect(result.complete).toBe(true);
	expect(result.dimensions).toEqual([8, 8]);
	expect(result.attachment).toBe(result.depthBuffer);
	expect([result.front, result.second, result.blocked, result.passed]).toEqual(['ff0000ff', '0000ffff', '000000ff', '00ff00ff']);
	expect(result.cycles).toEqual([true, true, true]);
	expect(result.sampleCount).toBe(result.samples.length);
	expect(result.actualSamples).toBe(result.samples[0]);
	expect(result.actualSamples).toBeGreaterThan(0);
	expect(result.multisample).toBe(true);
	expect(result.resolved).toBe('0000ffff');
	expect(result.deleted).toBe(true);
	expect(result.rejected).toEqual(['sample-limit', 'dimensions', 'blit-filter', 'draw-count', 'attachment-query']);
	expect(result.error).toBe(0);
});

test('typed state queries return scalar and array shapes without overwriting storage', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${context}${rejectHelper}
	glClearColor(0,0,1,1);glClear(GL_COLOR_BUFFER_BIT);
	glColorMask(true,false,false,false);glClearColor(1,1,1,1);glClear(GL_COLOR_BUFFER_BIT);
	$masked=$pixel();$mask=glGetBooleanv(GL_COLOR_WRITEMASK);
	glColorMask(true,true,true,true);
	glViewport(1,2,61,60);glScissor(3,4,50,48);glDepthRange(.25,.75);
	glBlendColor(.25,.5,.75,1);glBlendFuncSeparate(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA,GL_ONE,GL_ZERO);
	glBlendEquation(GL_FUNC_ADD);glBlendEquationSeparate(GL_FUNC_ADD,GL_FUNC_SUBTRACT);
	glEnable(GL_BLEND);glPolygonOffset(2,3);glLineWidth(1);
	glStencilFuncSeparate(GL_FRONT,GL_EQUAL,3,127);glStencilFuncSeparate(GL_BACK,GL_NOTEQUAL,4,63);
	glStencilOpSeparate(GL_FRONT,GL_KEEP,GL_INCR,GL_REPLACE);glStencilOpSeparate(GL_BACK,GL_ZERO,GL_DECR,GL_INVERT);
	glStencilMask(255);glStencilMaskSeparate(GL_BACK,7);
	$integers=[glGetIntegerv(GL_VIEWPORT),glGetIntegerv(GL_SCISSOR_BOX)];
	$floats=[glGetFloatv(GL_DEPTH_RANGE),glGetFloatv(GL_BLEND_COLOR),glGetFloatv(GL_POLYGON_OFFSET_FACTOR),glGetFloatv(GL_POLYGON_OFFSET_UNITS)];
	$booleans=[glGetBooleanv(GL_BLEND),glGetBooleanv(GL_DEPTH_TEST),$mask];
	$stencil=[glGetIntegerv(GL_STENCIL_REF),glGetIntegerv(GL_STENCIL_BACK_REF),glGetIntegerv(GL_STENCIL_WRITEMASK),glGetIntegerv(GL_STENCIL_BACK_WRITEMASK)];
	$blend=glGetIntegerv(GL_BLEND_EQUATION_ALPHA)===GL_FUNC_SUBTRACT&&glGetIntegerv(GL_BLEND_SRC_RGB)===GL_SRC_ALPHA&&glGetIntegerv(GL_BLEND_SRC_ALPHA)===GL_ONE;
	$formats=glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS);$formatCount=glGetIntegerv(GL_NUM_COMPRESSED_TEXTURE_FORMATS);
	$extensions=[];for($index=0;$index<glGetIntegerv(GL_NUM_EXTENSIONS);$index++){$extensions[]=glGetStringi(GL_EXTENSIONS,$index);}
	$reject('selector',function(){glGetIntegerv(GL_TEXTURE_2D);});
	$reject('nan',function(){glPolygonOffset(NAN,0);});
	$reject('float-overflow',function(){glDepthRange(0,1e100);});
	$holder=new class{public int $value=0;};
	foreach(['glGenBuffers','glGenTextures','glGenVertexArrays','glGenFramebuffers','glGenRenderbuffers'] as $generate){
		$reject($generate,function() use ($generate,$holder){$generate(1,$holder->value);});
		$empty=[123];$generate(0,$empty);if($empty!==[]){throw new RuntimeException('zero generation did not clear output');}
	}
	$error=glGetError();${cleanup}
	echo json_encode(compact('masked','integers','floats','booleans','stencil','blend','formats','formatCount','extensions','rejected','error'));
	`);
	expect(result.masked).toBe('ff00ffff');
	expect(result.integers).toEqual([[1, 2, 61, 60], [3, 4, 50, 48]]);
	expect(result.floats).toEqual([[.25, .75], [.25, .5, .75, 1], 2, 3]);
	expect(result.booleans).toEqual([true, false, [true, false, false, false]]);
	expect(result.stencil).toEqual([3, 4, 255, 7]);
	expect(result.blend).toBe(true);
	expect(result.formats.length).toBe(result.formatCount);
	expect(result.extensions.length).toBeGreaterThan(0);
	expect(result.extensions.every(extension => typeof extension === 'string')).toBe(true);
	expect(result.rejected).toEqual(['selector', 'nan', 'float-overflow', 'glGenBuffers', 'glGenTextures', 'glGenVertexArrays', 'glGenFramebuffers', 'glGenRenderbuffers']);
	expect(result.error).toBe(0);
});

test('WebGL2 bindings reject a WebGL1 context with a catchable error', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`
	SDL_Init(SDL_INIT_VIDEO);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,2);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
	$window=SDL_CreateWindow('WebGL1',0,0,64,64,SDL_WINDOW_OPENGL);
	$context=SDL_GL_CreateContext($window);SDL_GL_MakeCurrent($window,$context);
	$errors=[];
	foreach([
		function(){glDrawArraysInstanced(GL_TRIANGLES,0,0,0);},
		function(){glGetUniformBlockIndex(0,'Scene');},
		function(){glGenRenderbuffers(0,$buffers);},
		function(){glUniformMatrix2x3fv(-1,0,false,[]);},
		function(){glUniformMatrix3x2fv(-1,0,false,[]);},
		function(){glUniformMatrix2x4fv(-1,0,false,[]);},
		function(){glUniformMatrix4x2fv(-1,0,false,[]);},
		function(){glUniformMatrix3x4fv(-1,0,false,[]);},
		function(){glUniformMatrix4x3fv(-1,0,false,[]);}
	] as $call){try{$call();}catch(Error $error){$errors[]=$error->getMessage();}}
	${cleanup} echo json_encode($errors);
	`);
	expect(result).toHaveLength(9);
	for(const message of result)
	{
		expect(message).toContain('WebGL2 context');
	}
});
