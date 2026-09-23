<?php
/** @generate-function-entries */

function glGetString(int $name): ?string {}
function glGetError(): int {}
function glGetIntegerv(int $name): int|array {}
function glGetFloatv(int $name): float|array {}
function glGetBooleanv(int $name): bool|array {}
function glGetStringi(int $name, int $index): ?string {}
function glClear(int $mask): void {}
function glClearColor(float $red, float $green, float $blue, float $alpha): void {}
function glClearDepth(float $depth): void {}
function glClearStencil(int $value): void {}
function glEnable(int $capability): void {}
function glDisable(int $capability): void {}
function glIsEnabled(int $capability): bool {}
function glViewport(int $x, int $y, int $width, int $height): void {}
function glScissor(int $x, int $y, int $width, int $height): void {}
function glDepthFunc(int $function): void {}
function glDepthMask(bool $enabled): void {}
function glCullFace(int $mode): void {}
function glFrontFace(int $mode): void {}
function glBlendFunc(int $source, int $destination): void {}
function glPixelStorei(int $parameter, int $value): void {}
function glFlush(): void {}
function glFinish(): void {}
function glCreateShader(int $type): int {}
function glShaderSource(int $shader, int $count, string $source, int $length = 0): void {}
function glCompileShader(int $shader): void {}
function glGetShaderiv(int $shader, int $parameter): int {}
function glGetShaderInfoLog(int $shader): string {}
function glDeleteShader(int $shader): void {}
function glCreateProgram(): int {}
function glAttachShader(int $program, int $shader): void {}
function glDetachShader(int $program, int $shader): void {}
function glLinkProgram(int $program): void {}
function glGetProgramiv(int $program, int $parameter): int {}
function glGetProgramInfoLog(int $program): string {}
function glUseProgram(int $program): void {}
function glDeleteProgram(int $program): void {}
function glGetAttribLocation(int $program, string $name): int {}
function glGetUniformLocation(int $program, string $name): int {}
function glUniform1f(int $location, float $x): void {}
function glUniform2f(int $location, float $x, float $y): void {}
function glUniform3f(int $location, float $x, float $y, float $z): void {}
function glUniform4f(int $location, float $x, float $y, float $z, float $w): void {}
function glUniform1i(int $location, int $x): void {}
function glUniform2i(int $location, int $x, int $y): void {}
function glUniform3i(int $location, int $x, int $y, int $z): void {}
function glUniform4i(int $location, int $x, int $y, int $z, int $w): void {}
function glUniform1fv(int $location, int $count, array $values): void {}
function glUniform2fv(int $location, int $count, array $values): void {}
function glUniform3fv(int $location, int $count, array $values): void {}
function glUniform4fv(int $location, int $count, array $values): void {}
function glUniform1iv(int $location, int $count, array $values): void {}
function glUniform2iv(int $location, int $count, array $values): void {}
function glUniform3iv(int $location, int $count, array $values): void {}
function glUniform4iv(int $location, int $count, array $values): void {}
function glUniformMatrix2fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix3fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix4fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix2x3fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix3x2fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix2x4fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix4x2fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix3x4fv(int $location, int $count, bool $transpose, array $values): void {}
function glUniformMatrix4x3fv(int $location, int $count, bool $transpose, array $values): void {}
function glGenBuffers(int $count, array &$buffers): bool {}
function glBindBuffer(int $target, int $buffer): void {}
function glBufferData(int $target, int $size, ?string $data, int $usage): void {}
function glBufferSubData(int $target, int $offset, int $size, string $data): void {}
function glDeleteBuffers(int $count, array $buffers): void {}
function glGenVertexArrays(int $count, array &$arrays): bool {}
function glBindVertexArray(int $array): void {}
function glDeleteVertexArrays(int $count, array $arrays): void {}
function glEnableVertexAttribArray(int $index): void {}
function glDisableVertexAttribArray(int $index): void {}
function glVertexAttribPointer(int $index, int $size, int $type, bool $normalized, int $stride, int $offset): void {}
function glDrawArrays(int $mode, int $first, int $count): void {}
function glDrawElements(int $mode, int $count, int $type, int $offset): void {}
function glGenTextures(int $count, array &$textures): bool {}
function glBindTexture(int $target, int $texture): void {}
function glActiveTexture(int $texture): void {}
function glTexParameteri(int $target, int $parameter, int $value): void {}
function glTexParameterf(int $target, int $parameter, float $value): void {}
/** Scalar selectors only; unsupported selectors raise ValueError. */
function glGetTexParameteriv(int $target, int $parameter): int {}
function glGetTexParameterfv(int $target, int $parameter): float {}
/** $pixels accepts packed bytes, null, or an SDL_Surface (RGBA/UNSIGNED_BYTE). */
function glTexImage2D(int $target, int $level, int $internalFormat, int $width, int $height, int $border, int $format, int $type, mixed $pixels): void {}
function glTexSubImage2D(int $target, int $level, int $x, int $y, int $width, int $height, int $format, int $type, mixed $pixels): void {}
/** WebGL2 byte uploads honor UNPACK row/image lengths and skips. */
function glTexImage3D(int $target, int $level, int $internalFormat, int $width, int $height, int $depth, int $border, int $format, int $type, ?string $pixels): void {}
function glTexSubImage3D(int $target, int $level, int $x, int $y, int $z, int $width, int $height, int $depth, int $format, int $type, string $pixels): void {}
function glTexStorage2D(int $target, int $levels, int $internalFormat, int $width, int $height): void {}
function glTexStorage3D(int $target, int $levels, int $internalFormat, int $width, int $height, int $depth): void {}
/** imageSize must equal the format's block layout and fit in data; context support is required. */
function glCompressedTexImage2D(int $target, int $level, int $internalFormat, int $width, int $height, int $border, int $imageSize, string $data): void {}
function glCompressedTexSubImage2D(int $target, int $level, int $x, int $y, int $width, int $height, int $format, int $imageSize, string $data): void {}
function glCompressedTexImage3D(int $target, int $level, int $internalFormat, int $width, int $height, int $depth, int $border, int $imageSize, string $data): void {}
function glCompressedTexSubImage3D(int $target, int $level, int $x, int $y, int $z, int $width, int $height, int $depth, int $format, int $imageSize, string $data): void {}
function glGenerateMipmap(int $target): void {}
function glDeleteTextures(int $count, array $textures): void {}
function glGenSamplers(int $count, array &$samplers): bool {}
function glDeleteSamplers(int $count, array $samplers): void {}
function glIsSampler(int $sampler): bool {}
function glBindSampler(int $unit, int $sampler): void {}
function glSamplerParameteri(int $sampler, int $parameter, int $value): void {}
function glSamplerParameterf(int $sampler, int $parameter, float $value): void {}
function glGetSamplerParameteriv(int $sampler, int $parameter): int {}
function glGetSamplerParameterfv(int $sampler, int $parameter): float {}
/** Includes zeroed PACK prefixes/padding; requires no pixel-pack buffer binding. */
function glReadPixels(int $x, int $y, int $width, int $height, int $format, int $type): string {}
function glGenFramebuffers(int $count, array &$buffers): bool {}
function glBindFramebuffer(int $target, int $buffer): void {}
function glFramebufferTexture2D(int $target, int $attachment, int $textureTarget, int $texture, int $level): void {}
function glCheckFramebufferStatus(int $target): int {}
function glDeleteFramebuffers(int $count, array $buffers): void {}

function glVertexAttribIPointer(int $index, int $size, int $type, int $stride, int $offset): void {}
function glVertexAttribDivisor(int $index, int $divisor): void {}
function glDrawArraysInstanced(int $mode, int $first, int $count, int $instances): void {}
function glDrawElementsInstanced(int $mode, int $count, int $type, int $offset, int $instances): void {}
function glBindBufferBase(int $target, int $index, int $buffer): void {}
function glBindBufferRange(int $target, int $index, int $buffer, int $offset, int $size): void {}
function glGetBufferParameteriv(int $target, int $parameter): int {}
function glCopyBufferSubData(int $readTarget, int $writeTarget, int $readOffset, int $writeOffset, int $size): void {}
function glGetIntegeri_v(int $parameter, int $index): int {}
/** Missing symbols return GL_INVALID_INDEX (-1), including on wasm32. */
function glGetUniformBlockIndex(int $program, string $name): int {}
function glUniformBlockBinding(int $program, int $block, int $binding): void {}
/** Returns name, size and type for one active symbol. */
function glGetActiveUniform(int $program, int $index): ?array {}
/** Returns name, size and type for one active symbol. */
function glGetActiveAttrib(int $program, int $index): ?array {}
function glGetUniformIndices(int $program, array $names): array {}
function glGetActiveUniformsiv(int $program, array $indices, int $parameter): array {}
/** ACTIVE_UNIFORM_INDICES returns an array; other supported queries return an int. */
function glGetActiveUniformBlockiv(int $program, int $block, int $parameter): int|array {}
function glGetActiveUniformBlockName(int $program, int $block): ?string {}
/** Decimal strings represent uint32 values above PHP_INT_MAX exactly. */
function glUniform1ui(int $location, int|string $x): void {}
function glUniform2ui(int $location, int|string $x, int|string $y): void {}
function glUniform3ui(int $location, int|string $x, int|string $y, int|string $z): void {}
function glUniform4ui(int $location, int|string $x, int|string $y, int|string $z, int|string $w): void {}
function glUniform1uiv(int $location, int $count, array $values): void {}
function glUniform2uiv(int $location, int $count, array $values): void {}
function glUniform3uiv(int $location, int $count, array $values): void {}
function glUniform4uiv(int $location, int $count, array $values): void {}

function glGenRenderbuffers(int $count, array &$buffers): bool {}
function glDeleteRenderbuffers(int $count, array $buffers): void {}
function glBindRenderbuffer(int $target, int $buffer): void {}
function glRenderbufferStorage(int $target, int $format, int $width, int $height): void {}
function glRenderbufferStorageMultisample(int $target, int $samples, int $format, int $width, int $height): void {}
function glFramebufferRenderbuffer(int $target, int $attachment, int $renderbufferTarget, int $buffer): void {}
function glFramebufferTextureLayer(int $target, int $attachment, int $texture, int $level, int $layer): void {}
function glBlitFramebuffer(int $srcX0, int $srcY0, int $srcX1, int $srcY1, int $dstX0, int $dstY0, int $dstX1, int $dstY1, int $mask, int $filter): void {}
function glDrawBuffers(int $count, array $buffers): void {}
function glReadBuffer(int $source): void {}
function glGetRenderbufferParameteriv(int $target, int $parameter): int {}
function glGetFramebufferAttachmentParameteriv(int $target, int $attachment, int $parameter): int {}
function glGetInternalformativ(int $target, int $format, int $parameter): int|array {}

function glBlendFuncSeparate(int $srcRGB, int $dstRGB, int $srcAlpha, int $dstAlpha): void {}
function glBlendEquation(int $mode): void {}
function glBlendEquationSeparate(int $rgb, int $alpha): void {}
function glBlendColor(float $red, float $green, float $blue, float $alpha): void {}
function glColorMask(bool $red, bool $green, bool $blue, bool $alpha): void {}
function glStencilFunc(int $function, int $reference, int $mask): void {}
function glStencilFuncSeparate(int $face, int $function, int $reference, int $mask): void {}
function glStencilOp(int $fail, int $depthFail, int $depthPass): void {}
function glStencilOpSeparate(int $face, int $fail, int $depthFail, int $depthPass): void {}
function glStencilMask(int $mask): void {}
function glStencilMaskSeparate(int $face, int $mask): void {}
function glDepthRange(float $near, float $far): void {}
function glPolygonOffset(float $factor, float $units): void {}
function glLineWidth(float $width): void {}
function glIsBuffer(int $buffer): bool {}
function glIsTexture(int $texture): bool {}
function glIsFramebuffer(int $buffer): bool {}
function glIsRenderbuffer(int $buffer): bool {}
function glIsVertexArray(int $array): bool {}
function glIsShader(int $shader): bool {}
function glIsProgram(int $program): bool {}
