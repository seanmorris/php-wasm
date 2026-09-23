<?php
/** @generate-function-entries */

function TTF_RenderUTF8_Solid(TTF_Font $font, string $text, SDL_Color $color): ?SDL_Surface {}
function TTF_RenderUTF8_Solid_Wrapped(TTF_Font $font, string $text, SDL_Color $color, int $wrapLength): ?SDL_Surface {}
function TTF_RenderUTF8_Blended(TTF_Font $font, string $text, SDL_Color $color): ?SDL_Surface {}
function TTF_RenderUTF8_Blended_Wrapped(TTF_Font $font, string $text, SDL_Color $color, int $wrapLength): ?SDL_Surface {}
function TTF_RenderUTF8_Shaded(TTF_Font $font, string $text, SDL_Color $color, SDL_Color $background): ?SDL_Surface {}
function TTF_RenderUTF8_Shaded_Wrapped(TTF_Font $font, string $text, SDL_Color $color, SDL_Color $background, int $wrapLength): ?SDL_Surface {}
function TTF_RenderText_Solid_Wrapped(TTF_Font $font, string $text, SDL_Color $color, int $wrapLength): ?SDL_Surface {}
function TTF_RenderText_Blended_Wrapped(TTF_Font $font, string $text, SDL_Color $color, int $wrapLength): ?SDL_Surface {}
function TTF_RenderText_Shaded_Wrapped(TTF_Font $font, string $text, SDL_Color $color, SDL_Color $background, int $wrapLength): ?SDL_Surface {}
function TTF_SizeText(TTF_Font $font, string $text, ?int &$width, ?int &$height): int {}
function TTF_SizeUTF8(TTF_Font $font, string $text, ?int &$width, ?int &$height): int {}
function TTF_GlyphMetrics(TTF_Font $font, int $codepoint, ?int &$minX, ?int &$maxX, ?int &$minY, ?int &$maxY, ?int &$advance): int {}
function TTF_GlyphIsProvided(TTF_Font $font, int $codepoint): int {}
function TTF_GlyphMetrics32(TTF_Font $font, int $codepoint, ?int &$minX, ?int &$maxX, ?int &$minY, ?int &$maxY, ?int &$advance): int {}
function TTF_GlyphIsProvided32(TTF_Font $font, int $codepoint): int {}
function TTF_FontHeight(TTF_Font $font): int {}
function TTF_FontAscent(TTF_Font $font): int {}
function TTF_FontDescent(TTF_Font $font): int {}
function TTF_FontLineSkip(TTF_Font $font): int {}
function TTF_GetFontStyle(TTF_Font $font): int {}
function TTF_GetFontOutline(TTF_Font $font): int {}
function TTF_GetFontHinting(TTF_Font $font): int {}
function TTF_GetFontKerning(TTF_Font $font): int {}
function TTF_FontFaces(TTF_Font $font): int {}
function TTF_FontFaceIsFixedWidth(TTF_Font $font): int {}
function TTF_SetFontStyle(TTF_Font $font, int $value): void {}
function TTF_SetFontOutline(TTF_Font $font, int $value): void {}
function TTF_SetFontHinting(TTF_Font $font, int $value): void {}
function TTF_SetFontKerning(TTF_Font $font, int $value): void {}
function TTF_SetFontSize(TTF_Font $font, int $value): int {}
function TTF_FontFaceFamilyName(TTF_Font $font): ?string {}
function TTF_FontFaceStyleName(TTF_Font $font): ?string {}
