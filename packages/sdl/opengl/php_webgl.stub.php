<?php
/** @generate-function-entries */

function glGetString(int $name): ?string {}
function glGetError(): int {}
function glGetIntegerv(int $name): int {}
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
function glUniform1i(int $location, int $value): void {}
function glUniform1f(int $location, float $value): void {}
function glUniform3f(int $location, float $x, float $y, float $z): void {}
function glUniform4f(int $location, float $x, float $y, float $z, float $w): void {}
function glUniformMatrix4fv(int $location, int $count, bool $transpose, array $values): void {}
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
/** $pixels accepts packed bytes, null, or an SDL_Surface (RGBA/UNSIGNED_BYTE). */
function glTexImage2D(int $target, int $level, int $internalFormat, int $width, int $height, int $border, int $format, int $type, mixed $pixels): void {}
function glTexSubImage2D(int $target, int $level, int $x, int $y, int $width, int $height, int $format, int $type, mixed $pixels): void {}
function glGenerateMipmap(int $target): void {}
function glDeleteTextures(int $count, array $textures): void {}
function glReadPixels(int $x, int $y, int $width, int $height, int $format, int $type): string {}
function glGenFramebuffers(int $count, array &$buffers): bool {}
function glBindFramebuffer(int $target, int $buffer): void {}
function glFramebufferTexture2D(int $target, int $attachment, int $textureTarget, int $texture, int $level): void {}
function glCheckFramebufferStatus(int $target): int {}
function glDeleteFramebuffers(int $count, array $buffers): void {}
