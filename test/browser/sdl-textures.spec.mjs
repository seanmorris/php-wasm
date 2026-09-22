import {test, expect} from '@playwright/test';
import {start, run, rejectHelper, allocationStats} from './lib/sdl-bindings.mjs';

test.skip(process.env.PHP_VARIANT !== '_sdl', 'requires the SDL build');
test.afterEach(async ({page}) => {
	await page.evaluate(async () => window.bindingPhp?.refresh()).catch(() => {});
});

const setup = String.raw`
SDL_Init(SDL_INIT_VIDEO);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_ES);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3);
SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,0);
$window=SDL_CreateWindow('Textures',0,0,64,64,SDL_WINDOW_OPENGL);
$context=SDL_GL_CreateContext($window);
if(!$context || SDL_GL_MakeCurrent($window,$context)!==0) { throw new RuntimeException(SDL_GetError()); }
glDisable(GL_DITHER);
$programFrom=function($vertex,$fragment) {
	$program=glCreateProgram();
	foreach([[GL_VERTEX_SHADER,$vertex],[GL_FRAGMENT_SHADER,$fragment]] as [$type,$source]) {
		$shader=glCreateShader($type); glShaderSource($shader,1,$source); glCompileShader($shader);
		if(!glGetShaderiv($shader,GL_COMPILE_STATUS)) { throw new RuntimeException(glGetShaderInfoLog($shader)); }
		glAttachShader($program,$shader); glDeleteShader($shader);
	}
	glLinkProgram($program);
	if(!glGetProgramiv($program,GL_LINK_STATUS)) { throw new RuntimeException(glGetProgramInfoLog($program)); }
	return $program;
};
$texture=function($target) {
	glGenTextures(1,$ids); glBindTexture($target,$ids[0]);
	glTexParameteri($target,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
	glTexParameteri($target,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
	glTexParameteri($target,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);
	glTexParameteri($target,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
	return $ids[0];
};
$pixel=function($x=32,$y=32) { return bin2hex(glReadPixels($x,$y,1,1,GL_RGBA,GL_UNSIGNED_BYTE)); };
$draw=function($kind,$target,$id,$coord=[.5,.5,.5],$level=0) use($programFrom,$pixel) {
	$vertex="#version 300 es\nvoid main(){vec2 p[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));gl_Position=vec4(p[gl_VertexID],0,1);}";
	$coordinate=strpos($kind,'3D')!==false || strpos($kind,'Array')!==false || strpos($kind,'Cube')!==false ? 'coord' : 'coord.xy';
	$sample="textureLod(tex,$coordinate,level)";
	if($kind[0]==='u' || $kind[0]==='i') { $sample="vec4($sample)/255.0"; }
	$fragment="#version 300 es\nprecision highp float;uniform highp $kind tex;uniform vec3 coord;uniform float level;out vec4 color;void main(){color=$sample;}";
	$program=$programFrom($vertex,$fragment); glUseProgram($program);
	glActiveTexture(GL_TEXTURE0); glBindTexture($target,$id);
	glUniform1i(glGetUniformLocation($program,'tex'),0);
	glUniform3f(glGetUniformLocation($program,'coord'),...$coord);
	glUniform1f(glGetUniformLocation($program,'level'),$level);
	glBindFramebuffer(GL_FRAMEBUFFER,0); glViewport(0,0,64,64); glDrawArrays(GL_TRIANGLES,0,3);
	$result=$pixel(); glUseProgram(0); glDeleteProgram($program); return $result;
};
`;
const cleanup = 'SDL_GL_DeleteContext($context); SDL_DestroyWindow($window); SDL_Quit();';

test('compressed uploads and subuploads produce decoded pixels and check exact byte spans', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$formats=glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS);
	$format=GL_COMPRESSED_RGBA_S3TC_DXT1_EXT;
	if(!in_array($format,$formats,true)) { throw new RuntimeException('test browser must provide S3TC'); }
	$id=$texture(GL_TEXTURE_2D); $red=pack('vvV',0xf800,0,0); $green=pack('vvV',0x07e0,0,0);
	glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,4,4,0,8,$red.'unused trailing bytes');
	$before=$draw('sampler2D',GL_TEXTURE_2D,$id);
	glCompressedTexSubImage2D(GL_TEXTURE_2D,0,0,0,4,4,$format,8,$green);
	$after=$draw('sampler2D',GL_TEXTURE_2D,$id);
	$reject('short-compressed',fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,4,4,0,8,substr($red,0,-1)));
	$reject('wrong-image-size',fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,4,4,0,7,$red));
	$reject('oversized-image-size',fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,4,4,0,9,$red.'x'));
	$reject('block-overflow',fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,2147483647,2147483647,0,8,$red));
	$reject('unknown-format',fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,4,4,0,8,$red));
	$reject('compressed-border',fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,4,4,1,8,$red));
	glCompressedTexSubImage2D(GL_TEXTURE_2D,0,0,0,0,0,$format,0,''); $emptySub=glGetError();
	$preserved=$draw('sampler2D',GL_TEXTURE_2D,$id);
	glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,0,0,0,0,''); $emptyImage=glGetError();
	// Exercise every format advertised by this actual browser; exact block
	// dimensions include all ASTC footprints, not just 4x4 compression.
	$astc=[[4,4],[5,4],[5,5],[6,5],[6,6],[8,5],[8,6],[8,8],[10,5],[10,6],[10,8],[10,10],[12,10],[12,12]];
	$eight=[GL_ETC1_RGB8_OES,GL_COMPRESSED_RGB_S3TC_DXT1_EXT,GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
		GL_COMPRESSED_SRGB_S3TC_DXT1_EXT,GL_COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT,
		GL_COMPRESSED_R11_EAC,GL_COMPRESSED_SIGNED_R11_EAC,GL_COMPRESSED_RGB8_ETC2,GL_COMPRESSED_SRGB8_ETC2,
		GL_COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2,GL_COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2,
		GL_COMPRESSED_RED_RGTC1_EXT,GL_COMPRESSED_SIGNED_RED_RGTC1_EXT];
	$accepted=[];
	foreach($formats as $format) {
		$width=$height=4; $size=in_array($format,$eight,true)?8:16;
		if(($format>=0x93b0&&$format<=0x93bd)||($format>=0x93d0&&$format<=0x93dd)) { [$width,$height]=$astc[($format-0x93b0)&31]; }
		if($format>=0x8c00&&$format<=0x8c03) { $width=16; $height=8; $size=($format&1)?32:64; }
		glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,$width,$height,0,$size,str_repeat("\0",$size));
		$accepted[]=['format'=>$format,'error'=>glGetError()];
		$reject('length-'.$format,fn()=>glCompressedTexImage2D(GL_TEXTURE_2D,0,$format,$width,$height,0,$size,str_repeat("\0",$size-1)));
	}
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('before','after','preserved','emptySub','emptyImage','accepted','rejected','error'));
	`);
	expect([result.before,result.after,result.preserved]).toEqual(['ff0000ff','00ff00ff','00ff00ff']);
	expect([result.emptySub,result.emptyImage,result.error]).toEqual([0,0,0]);
	expect(result.accepted.length).toBeGreaterThan(10);
	expect(result.accepted.every(({error}) => error === 0)).toBe(true);
	await test.info().attach('compressed-formats', {body: JSON.stringify(result.accepted), contentType: 'application/json'});
	expect(result.rejected).toEqual([
		'short-compressed'
		, 'wrong-image-size'
		, 'oversized-image-size'
		, 'block-overflow'
		, 'unknown-format'
		, 'compressed-border'
		, ...result.accepted.map(({format}) => `length-${format}`)]);
});

test('compressed array layers upload and replace exact slices', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$formats=glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS); $format=GL_COMPRESSED_RGB8_ETC2;
	if(!in_array($format,$formats,true)) { throw new RuntimeException('test browser must provide ETC2'); }
	$id=$texture(GL_TEXTURE_2D_ARRAY); $black=str_repeat("\0",8); $white=hex2bin('ffffff0000000000');
	glCompressedTexImage3D(GL_TEXTURE_2D_ARRAY,0,$format,4,4,2,0,16,$black.$white);
	$before=[$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$id,[.5,.5,0]),$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$id,[.5,.5,1])];
	glCompressedTexSubImage3D(GL_TEXTURE_2D_ARRAY,0,0,0,1,4,4,1,$format,8,$black);
	$after=$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$id,[.5,.5,1]);
	$reject('short-slice',fn()=>glCompressedTexSubImage3D(GL_TEXTURE_2D_ARRAY,0,0,0,0,4,4,2,$format,16,$black));
	$reject('depth-overflow',fn()=>glCompressedTexImage3D(GL_TEXTURE_2D_ARRAY,0,$format,4,4,2147483647,0,8,$black));
	glCompressedTexSubImage3D(GL_TEXTURE_2D_ARRAY,0,0,0,0,0,0,0,$format,0,''); $emptySub=glGetError();
	glCompressedTexImage3D(GL_TEXTURE_2D_ARRAY,0,$format,0,0,0,0,0,''); $emptyImage=glGetError();
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('before','after','rejected','emptySub','emptyImage','error'));
	`);
	expect(result).toEqual({
		before: ['020202ff','ffffffff'], after: '020202ff'
		, rejected: ['short-slice','depth-overflow']
		, emptySub: 0
		, emptyImage: 0
		, error: 0});
});

test('unsupported compressed capabilities are rejected explicitly', async ({page}) => {
	await page.addInitScript(() => {
		for(const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype])
		{
			const original = prototype.getSupportedExtensions;
			const getExtension = prototype.getExtension;
			prototype.getSupportedExtensions = function() {
				return original.call(this).filter(name => !/compressed|compression/.test(name));
			};
			prototype.getExtension = function(name) {
				return /compressed|compression/.test(name) ? null : getExtension.call(this, name);
			};
		}
	});
	await start(page);
	const result = await run(page, String.raw`${setup}
	$id=$texture(GL_TEXTURE_2D); $formats=glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS);
	$failure=null;
	try { glCompressedTexImage2D(GL_TEXTURE_2D,0,GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,4,4,0,8,str_repeat("\0",8)); }
	catch(ValueError $error) { $failure=$error->getMessage(); }
	$error=glGetError(); ${cleanup} echo json_encode(compact('formats','failure','error'));
	`);
	expect(result.formats).toEqual([]);
	expect(result.failure).toMatch(/not supported by the current WebGL context/);
	expect(result.error).toBe(0);
});

test('sampler owners survive output errors and release every browser object on teardown', async ({page}) => {
	await page.addInitScript(() => {
		window.samplerObjects = {live: new Set, created: 0, deleted: 0};
		for(const operation of ['create', 'delete'])
		{
			const name = `${operation}Sampler`;
			const original = WebGL2RenderingContext.prototype[name];
			WebGL2RenderingContext.prototype[name] = function(...args) {
				const result = Reflect.apply(original, this, args);
				const record = window.samplerObjects;
				if(operation === 'create' && result)
				{
					record.live.add(result); record.created++;
				}
				else if(operation === 'delete' && record.live.delete(args[0]))
				{
					record.deleted++;
				}
				return result;
			};
		}
	});
	await start(page);
	// SDL keeps main-thread GL TLS storage until thread cleanup. Warm exactly
	// that path, then require the same native allocation count after churn/quit.
	await run(page, `${setup}${cleanup}`);
	const baseline = await allocationStats(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$holder=new class { public int $typed=7; public $value; };
	$reject('typed-output',function() use($holder){glGenSamplers(3,$holder->typed);});
	$holder->value=new class {
		function __destruct() { global $context,$window; SDL_GL_DeleteContext($context); $context=SDL_GL_CreateContext($window); }
	};
	$reject('destructive-output',function() use($holder){glGenSamplers(3,$holder->value);});
	$stale=$holder->value[0]; $invalidated=!glIsSampler($stale);
	for($i=0;$i<40;$i++) {
		glGenSamplers(8,$samplers); glBindSampler(0,$samplers[0]);
		glSamplerParameterf($samplers[0],GL_TEXTURE_MAX_LOD,2.5);
		SDL_GL_DeleteContext($context); $context=SDL_GL_CreateContext($window);
	}
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('rejected','invalidated','error')+['typed'=>$holder->typed]);
	`);
	expect(result).toEqual({rejected: ['typed-output','destructive-output'], invalidated: true, error: 0, typed: 7});
	const counts = await page.evaluate(() => ({...window.samplerObjects, live: window.samplerObjects.live.size}));
	expect(counts).toEqual({created: 326, deleted: 326, live: 0});
	for(let index = 0; index < 3; index++)
	{
		await run(page, `${setup} glGenSamplers(2,$samplers); glBindSampler(0,$samplers[0]);`);
		await page.evaluate(() => window.bindingPhp.refresh());
		expect(await page.evaluate(() => window.samplerObjects.live.size)).toBe(0);
	}
	const active = await run(page, 'echo json_encode((SDL_WasInit(SDL_INIT_VIDEO)&SDL_INIT_VIDEO)!==0); SDL_Quit();');
	expect(active).toBe(true);
	const final = await allocationStats(page);
	expect(final.sdlAllocations).toBe(baseline.sdlAllocations);
	await test.info().attach('sampler-allocations', {body: JSON.stringify({baseline,final,counts}), contentType: 'application/json'});
});

test('WebGL1 retains 2D transfers and rejects WebGL2 texture and sampler APIs', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup.replace('CONTEXT_MAJOR_VERSION,3', 'CONTEXT_MAJOR_VERSION,2')}${rejectHelper}
	$id=$texture(GL_TEXTURE_2D); glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin('123456ff'));
	glTexParameterf(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
	$filter=glGetTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER);
	glGenFramebuffers(1,$fb); glBindFramebuffer(GL_FRAMEBUFFER,$fb[0]);
	glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,$id,0); $color=$pixel(0,0);
	$valid=[glIsTexture($id),glIsFramebuffer($fb[0])];
	$reject('row-layout',fn()=>glPixelStorei(GL_UNPACK_ROW_LENGTH,2));
	$reject('3d-image',fn()=>glTexImage3D(GL_TEXTURE_3D,0,GL_RGBA8,1,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,null));
	$reject('3d-subimage',fn()=>glTexSubImage3D(GL_TEXTURE_3D,0,0,0,0,1,1,1,GL_RGBA,GL_UNSIGNED_BYTE,'1234'));
	$reject('immutable2d',fn()=>glTexStorage2D(GL_TEXTURE_2D,1,GL_RGBA8,1,1));
	$reject('immutable3d',fn()=>glTexStorage3D(GL_TEXTURE_3D,1,GL_RGBA8,1,1,1));
	$reject('compressed3d',fn()=>glCompressedTexImage3D(GL_TEXTURE_2D_ARRAY,0,GL_COMPRESSED_RGB8_ETC2,4,4,1,0,8,'12345678'));
	$reject('compressed3d-sub',fn()=>glCompressedTexSubImage3D(GL_TEXTURE_2D_ARRAY,0,0,0,0,4,4,1,GL_COMPRESSED_RGB8_ETC2,8,'12345678'));
	$reject('immutable-query',fn()=>glGetTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_IMMUTABLE_FORMAT));
	$reject('sampler-gen',function(){glGenSamplers(1,$samplers);});
	$reject('sampler-delete',fn()=>glDeleteSamplers(0,[]));
	$reject('sampler-is',fn()=>glIsSampler(1));
	$reject('sampler-bind',fn()=>glBindSampler(0,0));
	$reject('sampler-int',fn()=>glSamplerParameteri(1,GL_TEXTURE_MIN_FILTER,GL_NEAREST));
	$reject('sampler-float',fn()=>glSamplerParameterf(1,GL_TEXTURE_MIN_LOD,0));
	$reject('sampler-int-query',fn()=>glGetSamplerParameteriv(1,GL_TEXTURE_MIN_FILTER));
	$reject('sampler-float-query',fn()=>glGetSamplerParameterfv(1,GL_TEXTURE_MIN_LOD));
	$error=glGetError(); ${cleanup} echo json_encode(compact('color','filter','valid','rejected','error'));
	`);
	expect(result.color).toBe('123456ff');
	expect(result.filter).toBe(9728);
	expect(result.valid).toEqual([true,true]);
	expect(result.rejected).toEqual([
		'row-layout'
		, '3d-image'
		, '3d-subimage'
		, 'immutable2d'
		, 'immutable3d'
		, 'compressed3d'
		, 'compressed3d-sub'
		, 'immutable-query'
		, 'sampler-gen'
		, 'sampler-delete'
		, 'sampler-is'
		, 'sampler-bind'
		, 'sampler-int'
		, 'sampler-float'
		, 'sampler-int-query'
		, 'sampler-float-query']);
	expect(result.error).toBe(0);
});

test('textures and samplers can be recreated after real browser context loss and restoration', async ({page}) => {
	await start(page);
	const before = await run(page, String.raw`${setup}
	$id=$texture(GL_TEXTURE_2D); glTexStorage2D(GL_TEXTURE_2D,1,GL_RGBA8,1,1);
	glTexSubImage2D(GL_TEXTURE_2D,0,0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin('ff0000ff'));
	glGenSamplers(1,$samplers); glSamplerParameteri($samplers[0],GL_TEXTURE_MIN_FILTER,GL_NEAREST); glBindSampler(0,$samplers[0]);
	glGenFramebuffers(1,$oldFb); glBindFramebuffer(GL_FRAMEBUFFER,$oldFb[0]);
	glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,$id,0);
	glGenRenderbuffers(1,$oldRb); glBindRenderbuffer(GL_RENDERBUFFER,$oldRb[0]);
	glRenderbufferStorage(GL_RENDERBUFFER,GL_DEPTH24_STENCIL8,1,1);
	glFramebufferRenderbuffer(GL_FRAMEBUFFER,GL_DEPTH_STENCIL_ATTACHMENT,GL_RENDERBUFFER,$oldRb[0]);
	glGenVertexArrays(1,$oldVao); glBindVertexArray($oldVao[0]);
	glGenBuffers(1,$oldBuffer); glBindBuffer(GL_PIXEL_UNPACK_BUFFER,$oldBuffer[0]); glBufferData(GL_PIXEL_UNPACK_BUFFER,4,null,GL_STATIC_DRAW);
	glPixelStorei(GL_UNPACK_ALIGNMENT,8); glPixelStorei(GL_UNPACK_ROW_LENGTH,32);
	$oldProgram=glCreateProgram(); $oldShader=glCreateShader(GL_VERTEX_SHADER);
	echo json_encode($draw('sampler2D',GL_TEXTURE_2D,$id));
	`);
	expect(before).toBe('ff0000ff');
	await page.evaluate(async () => {
		const canvas = document.querySelector('canvas');
		const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
		if(!extension)
		{
			throw new Error('Context loss extension is required for this fixture');
		}
		window.restoreTextureContext = extension;
		await new Promise(resolve => {
			canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); resolve(); }, {once: true});
			extension.loseContext();
		});
	});
	const lost = await run(page, 'echo json_encode([glGetError(),glIsTexture($id),glIsSampler($samplers[0]),glIsFramebuffer($oldFb[0]),glIsRenderbuffer($oldRb[0])]);');
	expect(lost).toEqual([37442,false,false,false,false]);
	await page.evaluate(async () => {
		const canvas = document.querySelector('canvas');
		await new Promise(resolve => {
			canvas.addEventListener('webglcontextrestored', resolve, {once: true});
			window.restoreTextureContext.restoreContext();
		});
	});
	const after = await run(page, String.raw`
	$old=[glIsTexture($id),glIsSampler($samplers[0]),glIsFramebuffer($oldFb[0]),glIsRenderbuffer($oldRb[0])];
	glDeleteSamplers(1,$samplers); glDeleteTextures(1,[$id]);
	glDeleteFramebuffers(1,$oldFb); glDeleteRenderbuffers(1,$oldRb);
	glDeleteVertexArrays(1,$oldVao); glDeleteBuffers(1,$oldBuffer);
	glDeleteProgram($oldProgram); glDeleteShader($oldShader);
	$id=$texture(GL_TEXTURE_2D); glTexStorage2D(GL_TEXTURE_2D,1,GL_RGBA8,1,1);
	glTexSubImage2D(GL_TEXTURE_2D,0,0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin('00ff00ff'));
	glGenSamplers(1,$samplers); glSamplerParameteri($samplers[0],GL_TEXTURE_MIN_FILTER,GL_NEAREST); glBindSampler(0,$samplers[0]);
	$color=$draw('sampler2D',GL_TEXTURE_2D,$id);
	$array=$texture(GL_TEXTURE_2D_ARRAY); glTexStorage3D(GL_TEXTURE_2D_ARRAY,1,GL_RGBA8,2,2,2);
	glGenFramebuffers(2,$fb); glBindFramebuffer(GL_FRAMEBUFFER,$fb[0]);
	glFramebufferTextureLayer(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,$array,0,1);
	$statuses=[glCheckFramebufferStatus(GL_FRAMEBUFFER)];
	$supported=array_values(array_intersect(glGetInternalformativ(GL_RENDERBUFFER,GL_RGBA8,GL_SAMPLES),glGetInternalformativ(GL_RENDERBUFFER,GL_DEPTH24_STENCIL8,GL_SAMPLES)));
	if(!$supported || !$supported[0]) { throw new RuntimeException('test browser must provide multisample depth/stencil'); }
	glGenRenderbuffers(2,$rb); glBindFramebuffer(GL_FRAMEBUFFER,$fb[1]);
	foreach([[0,GL_RGBA8,GL_COLOR_ATTACHMENT0],[1,GL_DEPTH24_STENCIL8,GL_DEPTH_STENCIL_ATTACHMENT]] as [$i,$format,$attachment]) {
		glBindRenderbuffer(GL_RENDERBUFFER,$rb[$i]); glRenderbufferStorageMultisample(GL_RENDERBUFFER,$supported[0],$format,2,2);
		glFramebufferRenderbuffer(GL_FRAMEBUFFER,$attachment,GL_RENDERBUFFER,$rb[$i]);
	}
	$statuses[]=glCheckFramebufferStatus(GL_FRAMEBUFFER);
	glClearColor(0,0,1,1); glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT|GL_STENCIL_BUFFER_BIT);
	glBindFramebuffer(GL_READ_FRAMEBUFFER,$fb[1]); glBindFramebuffer(GL_DRAW_FRAMEBUFFER,$fb[0]);
	glBlitFramebuffer(0,0,2,2,0,0,2,2,GL_COLOR_BUFFER_BIT,GL_NEAREST);
	glBindFramebuffer(GL_READ_FRAMEBUFFER,$fb[0]); $resolved=$pixel(0,0);
	$layer=$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$array,[.5,.5,1]);
	$compressed=$texture(GL_TEXTURE_2D);
	glCompressedTexImage2D(GL_TEXTURE_2D,0,GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,4,4,0,8,pack('vvV',0xf800,0,0));
	$decoded=$draw('sampler2D',GL_TEXTURE_2D,$compressed);
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('old','color','statuses','resolved','layer','decoded','error'));
	`);
	expect(after).toEqual({old: [false,false,false,false], color: '00ff00ff', statuses: [36053,36053], resolved: '0000ffff', layer: '0000ffff', decoded: 'ff0000ff', error: 0});
});

test('immutable 2D and cube storage preserve mip levels and sampled faces', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}
	$id=$texture(GL_TEXTURE_2D); glTexStorage2D(GL_TEXTURE_2D,3,GL_RGBA8,4,4);
	$immutable=[glGetTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_IMMUTABLE_FORMAT),glGetTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_IMMUTABLE_LEVELS)];
	foreach([[0,4,"\xff\x00\x00\xff"],[1,2,"\x00\xff\x00\xff"],[2,1,"\x00\x00\xff\xff"]] as [$level,$size,$color]) {
		glTexSubImage2D(GL_TEXTURE_2D,$level,0,0,$size,$size,GL_RGBA,GL_UNSIGNED_BYTE,str_repeat($color,$size*$size));
	}
	glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST_MIPMAP_NEAREST);
	$mips=[]; for($i=0;$i<3;$i++) { $mips[]=$draw('sampler2D',GL_TEXTURE_2D,$id,[.5,.5,0],$i); }
	glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,4,4,0,GL_RGBA,GL_UNSIGNED_BYTE,null);
	$redefinition=glGetError(); $preserved=$draw('sampler2D',GL_TEXTURE_2D,$id);
	$cube=$texture(GL_TEXTURE_CUBE_MAP); glTexStorage2D(GL_TEXTURE_CUBE_MAP,1,GL_RGBA8,1,1);
	$colors=['ff0000ff','00ff00ff','0000ffff','ffff00ff','ff00ffff','00ffffff'];
	$directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
	foreach($colors as $i=>$color) { glTexSubImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X+$i,0,0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin($color)); }
	$faces=[]; foreach($directions as $direction) { $faces[]=$draw('samplerCube',GL_TEXTURE_CUBE_MAP,$cube,$direction); }
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('immutable','mips','redefinition','preserved','faces','error'));
	`);
	expect(result).toEqual({
		immutable: [1,3]
		, mips: ['ff0000ff','00ff00ff','0000ffff']
		, redefinition: 1282
		, preserved: 'ff0000ff'
		, faces: ['ff0000ff','00ff00ff','0000ffff','ffff00ff','ff00ffff','00ffffff']
		, error: 0});
});

test('3D and array textures sample updated layers and layered framebuffer writes', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}
	$volume=$texture(GL_TEXTURE_3D);
	glTexImage3D(GL_TEXTURE_3D,0,GL_RGBA8,1,1,2,0,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin('ff0000ff00ff00ff'));
	$before=[$draw('sampler3D',GL_TEXTURE_3D,$volume,[.5,.5,.25]),$draw('sampler3D',GL_TEXTURE_3D,$volume,[.5,.5,.75])];
	glTexSubImage3D(GL_TEXTURE_3D,0,0,0,1,1,1,1,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin('0000ffff'));
	$updated=$draw('sampler3D',GL_TEXTURE_3D,$volume,[.5,.5,.75]);
	$array=$texture(GL_TEXTURE_2D_ARRAY); glTexStorage3D(GL_TEXTURE_2D_ARRAY,1,GL_RGBA8,2,2,2);
	glTexSubImage3D(GL_TEXTURE_2D_ARRAY,0,0,0,0,2,2,2,GL_RGBA,GL_UNSIGNED_BYTE,str_repeat(hex2bin('ff0000ff'),4).str_repeat(hex2bin('00ff00ff'),4));
	$layers=[$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$array,[.5,.5,0]),$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$array,[.5,.5,1])];
	glGenFramebuffers(1,$fb); glBindFramebuffer(GL_FRAMEBUFFER,$fb[0]);
	glFramebufferTextureLayer(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,$array,0,1);
	$status=glCheckFramebufferStatus(GL_FRAMEBUFFER);
	$attachment=glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER);
	glClearColor(0,0,1,1); glClear(GL_COLOR_BUFFER_BIT);
	$read=$pixel(0,0);
	$rendered=[$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$array,[.5,.5,0]),$draw('sampler2DArray',GL_TEXTURE_2D_ARRAY,$array,[.5,.5,1])];
	glBindFramebuffer(GL_FRAMEBUFFER,$fb[0]); glFramebufferTextureLayer(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,$volume,0,0);
	glClearColor(1,1,0,1); glClear(GL_COLOR_BUFFER_BIT);
	$volumeRendered=$draw('sampler3D',GL_TEXTURE_3D,$volume,[.5,.5,.25]);
	glDeleteFramebuffers(1,$fb); glDeleteTextures(2,[$volume,$array]);
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('before','updated','layers','status','attachment','read','rendered','volumeRendered','error'));
	`);
	expect(result).toEqual({
		before: ['ff0000ff','00ff00ff']
		, updated: '0000ffff'
		, layers: ['ff0000ff','00ff00ff']
		, status: 36053
		, attachment: 1
		, read: '0000ffff'
		, rendered: ['ff0000ff','0000ffff']
		, volumeRendered: 'ffff00ff'
		, error: 0});
});

test('pixel transfers honor row and image strides, surface isolation and zeroed readback gaps', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$id=$texture(GL_TEXTURE_2D);
	glPixelStorei(GL_UNPACK_ALIGNMENT,8); glPixelStorei(GL_UNPACK_ROW_LENGTH,3);
	glPixelStorei(GL_UNPACK_SKIP_ROWS,1); glPixelStorei(GL_UNPACK_SKIP_PIXELS,1);
	$bytes=str_repeat("\xcc",20).hex2bin('ff0000ff00ff00ff').str_repeat("\xcc",8).hex2bin('0000ffffffff00ff');
	glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,2,2,0,GL_RGBA,GL_UNSIGNED_BYTE,$bytes);
	$rows=[]; foreach([[.25,.25,0],[.75,.25,0],[.25,.75,0],[.75,.75,0]] as $coord) { $rows[]=$draw('sampler2D',GL_TEXTURE_2D,$id,$coord); }
	$reject('short-row',function() use($bytes){glTexSubImage2D(GL_TEXTURE_2D,0,0,0,2,2,GL_RGBA,GL_UNSIGNED_BYTE,substr($bytes,0,-1));});
	glPixelStorei(GL_UNPACK_IMAGE_HEIGHT,3); glPixelStorei(GL_UNPACK_SKIP_IMAGES,1);
	$volume=$texture(GL_TEXTURE_3D);
	$images=str_repeat("\xcc",68).hex2bin('ff00ffff').str_repeat("\xcc",44).hex2bin('00ffffff');
	glTexImage3D(GL_TEXTURE_3D,0,GL_RGBA8,1,1,2,0,GL_RGBA,GL_UNSIGNED_BYTE,$images);
	$slices=[$draw('sampler3D',GL_TEXTURE_3D,$volume,[.5,.5,.25]),$draw('sampler3D',GL_TEXTURE_3D,$volume,[.5,.5,.75])];
	$reject('short-image',function() use($images){glTexSubImage3D(GL_TEXTURE_3D,0,0,0,0,1,1,2,GL_RGBA,GL_UNSIGNED_BYTE,substr($images,0,-1));});
	$surface=new SDL_Surface(0,1,1,32,0xff,0xff00,0xff0000,-16777216);
	SDL_FillRect($surface,null,SDL_MapRGBA($surface->format,17,34,51,255));
	glBindTexture(GL_TEXTURE_2D,$id); glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,$surface);
	$surfacePixel=$draw('sampler2D',GL_TEXTURE_2D,$id);
	$fields=[GL_UNPACK_ALIGNMENT,GL_UNPACK_ROW_LENGTH,GL_UNPACK_SKIP_ROWS,GL_UNPACK_SKIP_PIXELS,GL_UNPACK_IMAGE_HEIGHT,GL_UNPACK_SKIP_IMAGES];
	$restored=array_map('glGetIntegerv',$fields); SDL_FreeSurface($surface);
	glPixelStorei(GL_PACK_ALIGNMENT,8); glPixelStorei(GL_PACK_ROW_LENGTH,3);
	glPixelStorei(GL_PACK_SKIP_ROWS,1); glPixelStorei(GL_PACK_SKIP_PIXELS,1);
	$packed=bin2hex(glReadPixels(0,0,2,2,GL_RGBA,GL_UNSIGNED_BYTE));
	$empty=glReadPixels(0,0,0,0,GL_RGBA,GL_UNSIGNED_BYTE);
	glBindFramebuffer(GL_FRAMEBUFFER,0); glReadBuffer(GL_NONE);
	$failed=bin2hex(glReadPixels(0,0,2,2,GL_RGBA,GL_UNSIGNED_BYTE)); $nativeError=glGetError();
	glReadBuffer(GL_BACK);
	foreach($fields as $field) { glPixelStorei($field,$field===GL_UNPACK_ALIGNMENT?4:0); }
	glPixelStorei(GL_PACK_ALIGNMENT,4); foreach([GL_PACK_ROW_LENGTH,GL_PACK_SKIP_ROWS,GL_PACK_SKIP_PIXELS] as $field) { glPixelStorei($field,0); }
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('rows','slices','surfacePixel','restored','packed','empty','failed','nativeError','rejected','error'));
	`);
	expect(result.rows).toEqual(['ff0000ff','00ff00ff','0000ffff','ffff00ff']);
	expect(result.slices).toEqual(['ff00ffff','00ffffff']);
	expect(result.surfacePixel).toBe('112233ff');
	expect(result.restored).toEqual([8,3,1,1,3,1]);
	expect(result.packed).toBe('00'.repeat(20) + '112233ff'.repeat(2) + '00'.repeat(8) + '112233ff'.repeat(2));
	expect(result.empty).toBe('');
	expect(result.failed).toBe('00'.repeat(44));
	expect(result.nativeError).toBe(1282);
	expect(result.rejected).toEqual(['short-row','short-image']);
	expect(result.error).toBe(0);
});

test('packed, signed, integer, half and float pixels preserve their native layouts', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$id=$texture(GL_TEXTURE_2D); glPixelStorei(GL_UNPACK_ALIGNMENT,1);
	$cases=[
		[GL_RGB565,GL_RGB,GL_UNSIGNED_SHORT_5_6_5,pack('v',0xf800),'sampler2D'],
		[GL_RGBA4,GL_RGBA,GL_UNSIGNED_SHORT_4_4_4_4,pack('v',0x0f0f),'sampler2D'],
		[GL_RGB5_A1,GL_RGBA,GL_UNSIGNED_SHORT_5_5_5_1,pack('v',0x003f),'sampler2D'],
		[GL_RGBA8UI,GL_RGBA_INTEGER,GL_UNSIGNED_BYTE,hex2bin('ff00ffff'),'usampler2D'],
		[GL_RGBA16I,GL_RGBA_INTEGER,GL_SHORT,pack('v*',255,0,255,255),'isampler2D'],
		[GL_RGBA32UI,GL_RGBA_INTEGER,GL_UNSIGNED_INT,pack('V*',0,255,255,255),'usampler2D'],
		[GL_RGBA16F,GL_RGBA,GL_HALF_FLOAT,pack('v*',0x3c00,0,0x3c00,0x3c00),'sampler2D'],
		[GL_RGBA32F,GL_RGBA,GL_FLOAT,pack('f*',0,1,1,1),'sampler2D'],
		[GL_RGBA8_SNORM,GL_RGBA,GL_BYTE,pack('c*',127,0,127,127),'sampler2D'],
		[GL_RGB10_A2,GL_RGBA,GL_UNSIGNED_INT_2_10_10_10_REV,hex2bin('ff0300c0'),'sampler2D']
	];
	$pixels=[];
	foreach($cases as $i=>[$internal,$format,$type,$bytes,$kind]) {
		glTexImage2D(GL_TEXTURE_2D,0,$internal,1,1,0,$format,$type,$bytes);
		$pixels[]=$draw($kind,GL_TEXTURE_2D,$id);
		$reject('short-'.$i,function() use($format,$type,$bytes){glTexSubImage2D(GL_TEXTURE_2D,0,0,0,1,1,$format,$type,substr($bytes,0,-1));});
	}
	glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8UI,1,1,0,GL_RGBA_INTEGER,GL_UNSIGNED_BYTE,hex2bin('112233ff'));
	glGenFramebuffers(1,$fb); glBindFramebuffer(GL_FRAMEBUFFER,$fb[0]);
	glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,$id,0);
	$integerRead=array_values(unpack('V*',glReadPixels(0,0,1,1,GL_RGBA_INTEGER,GL_UNSIGNED_INT)));
	glBindFramebuffer(GL_FRAMEBUFFER,0); glDeleteFramebuffers(1,$fb);
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('pixels','integerRead','rejected','error'));
	`);
	expect(result.pixels).toEqual(['ff0000ff','00ff00ff','0000ffff','ff00ffff','ff00ffff','00ffffff','ff00ffff','00ffffff','ff00ffff','ff0000ff']);
	expect(result.integerRead).toEqual([17,34,51,255]);
	expect(result.rejected).toEqual(Array.from({length: 10}, (_, index) => `short-${index}`));
	expect(result.error).toBe(0);
});

test('unsafe layouts, PBO bindings and invalid texture parameters fail before native transfers', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$id=$texture(GL_TEXTURE_2D);
	$reject('alignment',fn()=>glPixelStorei(GL_UNPACK_ALIGNMENT,3));
	$reject('pixel-selector',fn()=>glPixelStorei(GL_VIEWPORT,0));
	$reject('negative-row',fn()=>glPixelStorei(GL_UNPACK_ROW_LENGTH,-1));
	$reject('border',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,1,GL_RGBA,GL_UNSIGNED_BYTE,null));
	$reject('negative-size',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,-1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,null));
	$reject('bad-packed-pair',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_SHORT_5_6_5,'1234'));
	$reject('wrong-bytes',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,[]));
	glPixelStorei(GL_UNPACK_SKIP_PIXELS,1);
	$reject('row-extent',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,'12345678'));
	// Null allocation has no client-data row to overrun.
	glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,null);
	$nullError=glGetError(); glPixelStorei(GL_UNPACK_SKIP_PIXELS,0);
	glPixelStorei(GL_UNPACK_ROW_LENGTH,2147483647);
	$reject('stride-overflow',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,'1234'));
	glPixelStorei(GL_UNPACK_ROW_LENGTH,0); glPixelStorei(GL_UNPACK_SKIP_ROWS,2147483647);
	$reject('offset-overflow',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,'1234'));
	glPixelStorei(GL_UNPACK_SKIP_ROWS,0);
	$volume=$texture(GL_TEXTURE_3D); glPixelStorei(GL_UNPACK_SKIP_ROWS,1);
	$reject('image-extent',fn()=>glTexImage3D(GL_TEXTURE_3D,0,GL_RGBA8,1,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,'12345678'));
	glPixelStorei(GL_UNPACK_SKIP_ROWS,0); glPixelStorei(GL_UNPACK_SKIP_IMAGES,2147483647);
	$reject('image-overflow',fn()=>glTexImage3D(GL_TEXTURE_3D,0,GL_RGBA8,1,1,2,0,GL_RGBA,GL_UNSIGNED_BYTE,'12345678'));
	glPixelStorei(GL_UNPACK_SKIP_IMAGES,0);
	glGenBuffers(1,$buffers); glBindBuffer(GL_PIXEL_UNPACK_BUFFER,$buffers[0]); glBufferData(GL_PIXEL_UNPACK_BUFFER,16,null,GL_STATIC_DRAW);
	$reject('pbo-upload',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,'1234'));
	$reject('pbo-null',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,null));
	glBindBuffer(GL_PIXEL_UNPACK_BUFFER,0); glBindBuffer(GL_PIXEL_PACK_BUFFER,$buffers[0]);
	$reject('pbo-read',fn()=>glReadPixels(0,0,1,1,GL_RGBA,GL_UNSIGNED_BYTE));
	glBindBuffer(GL_PIXEL_PACK_BUFFER,0); glDeleteBuffers(1,$buffers);
	glBindTexture(GL_TEXTURE_2D,$id);
	$reject('depth-bytes',fn()=>glTexImage2D(GL_TEXTURE_2D,0,GL_DEPTH32F_STENCIL8,1,1,0,GL_DEPTH_STENCIL,GL_FLOAT_32_UNSIGNED_INT_24_8_REV,str_repeat('x',8)));
	glTexImage2D(GL_TEXTURE_2D,0,GL_DEPTH32F_STENCIL8,1,1,0,GL_DEPTH_STENCIL,GL_FLOAT_32_UNSIGNED_INT_24_8_REV,null);
	$depthError=glGetError();
	$reject('query-shape',fn()=>glGetTexParameteriv(GL_TEXTURE_2D,GL_VIEWPORT));
	$reject('float-nan',fn()=>glTexParameterf(GL_TEXTURE_2D,GL_TEXTURE_MIN_LOD,NAN));
	$reject('float-overflow',fn()=>glTexParameterf(GL_TEXTURE_2D,GL_TEXTURE_MIN_LOD,1e100));
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('rejected','nullError','depthError','error'));
	`);
	expect(result.rejected).toEqual([
		'alignment'
		, 'pixel-selector'
		, 'negative-row'
		, 'border'
		, 'negative-size'
		, 'bad-packed-pair'
		, 'wrong-bytes'
		, 'row-extent'
		, 'stride-overflow'
		, 'offset-overflow'
		, 'image-extent'
		, 'image-overflow'
		, 'pbo-upload'
		, 'pbo-null'
		, 'pbo-read'
		, 'depth-bytes'
		, 'query-shape','float-nan','float-overflow']);
	expect([result.nullError,result.depthError,result.error]).toEqual([0,0,0]);
});

test('samplers override texture state and retain independent scalar parameters', async ({page}) => {
	await start(page);
	const result = await run(page, String.raw`${setup}${rejectHelper}
	$id=$texture(GL_TEXTURE_2D);
	glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,2,1,0,GL_RGBA,GL_UNSIGNED_BYTE,hex2bin('ff0000ff0000ffff'));
	glTexParameterf(GL_TEXTURE_2D,GL_TEXTURE_MIN_LOD,-.5); glTexParameterf(GL_TEXTURE_2D,GL_TEXTURE_MAX_LOD,2.5);
	$textureLod=[glGetTexParameterfv(GL_TEXTURE_2D,GL_TEXTURE_MIN_LOD),glGetTexParameterfv(GL_TEXTURE_2D,GL_TEXTURE_MAX_LOD)];
	$clamped=$draw('sampler2D',GL_TEXTURE_2D,$id,[1.25,.5,0]);
	$generated=glGenSamplers(1,$samplers); $sampler=$samplers[0]; $live=glIsSampler($sampler);
	glSamplerParameteri($sampler,GL_TEXTURE_MIN_FILTER,GL_NEAREST); glSamplerParameteri($sampler,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
	glSamplerParameteri($sampler,GL_TEXTURE_WRAP_S,GL_REPEAT); glSamplerParameteri($sampler,GL_TEXTURE_WRAP_T,GL_MIRRORED_REPEAT);
	glSamplerParameteri($sampler,GL_TEXTURE_WRAP_R,GL_CLAMP_TO_EDGE);
	glSamplerParameterf($sampler,GL_TEXTURE_MIN_LOD,-1.25); glSamplerParameterf($sampler,GL_TEXTURE_MAX_LOD,3.5);
	glSamplerParameteri($sampler,GL_TEXTURE_COMPARE_FUNC,GL_GREATER);
	$parameters=array_map(fn($name)=>glGetSamplerParameteriv($sampler,$name),[GL_TEXTURE_WRAP_S,GL_TEXTURE_WRAP_T,GL_TEXTURE_WRAP_R,GL_TEXTURE_COMPARE_MODE,GL_TEXTURE_COMPARE_FUNC]);
	$lod=[glGetSamplerParameterfv($sampler,GL_TEXTURE_MIN_LOD),glGetSamplerParameterfv($sampler,GL_TEXTURE_MAX_LOD)];
	glBindSampler(0,$sampler); $bound=glGetIntegerv(GL_SAMPLER_BINDING)===$sampler;
	$repeated=$draw('sampler2D',GL_TEXTURE_2D,$id,[1.25,.5,0]);
	glSamplerParameteri($sampler,GL_TEXTURE_MIN_FILTER,GL_LINEAR); glSamplerParameteri($sampler,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
	$filtered=$draw('sampler2D',GL_TEXTURE_2D,$id,[.5,.5,0]);
	glBindSampler(0,0); $unbound=$draw('sampler2D',GL_TEXTURE_2D,$id,[1.25,.5,0]);
	$unchanged=glGetTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S)===GL_CLAMP_TO_EDGE;
	$reject('sampler-selector',fn()=>glGetSamplerParameteriv($sampler,GL_TEXTURE_IMMUTABLE_LEVELS));
	$reject('sampler-nan',fn()=>glSamplerParameterf($sampler,GL_TEXTURE_MIN_LOD,NAN));
	glDeleteSamplers(1,$samplers); $deleted=!glIsSampler($sampler);
	$reject('deleted-sampler',fn()=>glBindSampler(0,$sampler));
	$reject('deleted-query',fn()=>glGetSamplerParameteriv($sampler,GL_TEXTURE_MIN_FILTER));
	$reject('negative-unit',fn()=>glBindSampler(-1,0));
	$reject('delete-count',fn()=>glDeleteSamplers(2,[]));
	glDeleteSamplers(1,$samplers); glGenSamplers(0,$empty);
	$error=glGetError(); ${cleanup}
	echo json_encode(compact('textureLod','clamped','generated','live','parameters','lod','bound','repeated','filtered','unbound','unchanged','deleted','empty','rejected','error'));
	`);
	expect(result).toEqual({
		textureLod: [-.5,2.5]
		, clamped: '0000ffff'
		, generated: true
		, live: true
		, parameters: [10497,33648,33071,0,516]
		, lod: [-1.25,3.5]
		, bound: true
		, repeated: 'ff0000ff'
		, filtered: '800080ff'
		, unbound: '0000ffff', unchanged: true, deleted: true, empty: []
		, rejected: ['sampler-selector','sampler-nan','deleted-sampler','deleted-query','negative-unit','delete-count']
		, error: 0});
});
