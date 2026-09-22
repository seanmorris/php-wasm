<?php
/** @generate-function-entries */

/**
 * @param resource $renderer
 * @param resource|null $texture
 * @param array $vertices Ordered tuples [x, y, red, green, blue, alpha, u, v].
 * @param array|null $indices Triangle indices; null uses sequential vertices.
 */
function SDL_RenderGeometry($renderer, $texture, array $vertices, ?array $indices = null): int {}

/**
 * Coordinates are packed native float32 pairs; colors are RGBA bytes.
 * Strides are bytes; zero reuses one element for all vertices.
 * Indices are packed unsigned 1/2/4-byte native-endian integers.
 * UV data may be null only when texture is null.
 * @param resource $renderer
 * @param resource|null $texture
 */
function SDL_RenderGeometryRaw($renderer, $texture, string $xy, int $xyStride, string $colors, int $colorStride, ?string $uv, int $uvStride, int $vertexCount, ?string $indices = null, int $indexCount = 0, int $indexSize = 4): int {}

/** @param resource $renderer */
function SDL_RenderDrawPoints($renderer, array $points): int {}
/** @param resource $renderer */
function SDL_RenderDrawLines($renderer, array $points): int {}
/** @param resource $renderer */
function SDL_RenderDrawRects($renderer, array $rectangles): int {}
/** @param resource $renderer */
function SDL_RenderFillRects($renderer, array $rectangles): int {}
/** @param resource $renderer */
function SDL_RenderDrawPointsF($renderer, array $points): int {}
/** @param resource $renderer */
function SDL_RenderDrawLinesF($renderer, array $points): int {}
/** @param resource $renderer */
function SDL_RenderDrawRectsF($renderer, array $rectangles): int {}
/** @param resource $renderer */
function SDL_RenderFillRectsF($renderer, array $rectangles): int {}

function SDL_GetNumRenderDrivers(): int {}
function SDL_GetRenderDriverInfo(int $index, ?array &$info): int {}
/** @param resource $renderer */
function SDL_GetRendererInfo($renderer, ?array &$info): int {}
/** @param resource $renderer */
function SDL_RenderTargetSupported($renderer): bool {}
/** @param resource $renderer */
function SDL_GetRenderDrawColor($renderer, ?int &$red, ?int &$green, ?int &$blue, ?int &$alpha): int {}
/** @param resource $renderer */
function SDL_SetRenderDrawBlendMode($renderer, int $mode): int {}
/** @param resource $renderer */
function SDL_GetRenderDrawBlendMode($renderer, ?int &$mode): int {}
/** @param resource $renderer */
function SDL_RenderSetViewport($renderer, ?SDL_Rect $rect): int {}
/** @param resource $renderer */
function SDL_RenderGetViewport($renderer, ?SDL_Rect &$rect): void {}
/** @param resource $renderer */
function SDL_RenderSetClipRect($renderer, ?SDL_Rect $rect): int {}
/** @param resource $renderer */
function SDL_RenderGetClipRect($renderer, ?SDL_Rect &$rect): void {}
/** @param resource $renderer */
function SDL_RenderIsClipEnabled($renderer): bool {}
/** @param resource $renderer */
function SDL_RenderSetLogicalSize($renderer, int $width, int $height): int {}
/** @param resource $renderer */
function SDL_RenderGetLogicalSize($renderer, ?int &$width, ?int &$height): void {}
/** @param resource $renderer */
function SDL_RenderSetIntegerScale($renderer, bool $enabled): int {}
/** @param resource $renderer */
function SDL_RenderGetIntegerScale($renderer): bool {}
/** @param resource $renderer */
function SDL_RenderSetScale($renderer, float $x, float $y): int {}
/** @param resource $renderer */
function SDL_RenderGetScale($renderer, ?float &$x, ?float &$y): void {}

/**
 * Convert window positions through the renderer's current viewport and scale.
 * @param resource $renderer
 */
function SDL_RenderWindowToLogical($renderer, int $windowX, int $windowY, ?float &$logicalX, ?float &$logicalY): void {}

/**
 * Convert logical positions to window integers, truncating toward zero.
 * Extreme transforms that cannot safely fit native int32 raise ValueError.
 * @param resource $renderer
 */
function SDL_RenderLogicalToWindow($renderer, float $logicalX, float $logicalY, ?int &$windowX, ?int &$windowY): void {}
