---
title: Demo
template: templates/with-hero.php
hero: hero-frame.php
framed: https://seanmorris.github.io/php-wasm/select-framework.html?iframed=1&no-service-worker=1
leftBarLink: false
TOC: false
---
<!--
Vendored from php-wasm-site commit eec9df8786a76525f3a07eaf85e597b3e8e57ff9
Source: https://github.com/seanmorris/php-wasm-site/blob/eec9df8786a76525f3a07eaf85e597b3e8e57ff9/pages/demos.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->

# Demo

Use the dialog above to launch a 100% local, user-editable site with a given framework.

## Editing files

The [Code Editor](https://seanmorris.github.io/php-wasm/code-editor.html) opens a
saveable untitled document when no file is selected. Use **File** to open an
existing path, or **Save** to choose a destination. PHP and the debugger see saved
files; draft recovery keeps unsaved edits separately. Files under `/persist` and
`/config` survive worker restarts. The editor supports file/folder operations,
uploads, downloads, ZIP transfers, quick open, and checked conflict handling.

The [VS Code example](https://seanmorris.github.io/php-wasm/vscode.html) uses the
same demo filesystem through File Bus. Directory expansion requests names and
types together when supported by both the host and runtime.

The [home page](https://seanmorris.github.io/php-wasm/home.html) lists the demos;
**More…** includes Query Workbench and PHP-CLI Preview. Interactive line input
remains available in the CLI and debugger; the standalone Waitline test link
has been removed from that menu.

## PHP Scripts

Use the editor below to write PHP scripts that run right in the page:

<iframe class = "page-demo" src = "https://seanmorris.github.io/php-wasm/embedded-php.html?iframed=1&no-service-worker=1&demo=sdl-sine.php"></iframe>

### SDL Cube and SDL Sine

Development builds add **SDL Cube** alongside **SDL Sine**. The cube uses the
`sean-icon-32` pixel-art texture without interpolation, a TrueType overlay,
keyboard controls, MP3 music, and WAV effects. The track is **Unreal Superhero 3**
by **Kenët and rez**, as credited in its ID3 tags. It requires WebGL2. Click
**Enable audio**, then focus the canvas: arrows/WASD rotate, Space pauses, R
resets, M mutes, and Escape stops. **Run** restarts; **Refresh** releases resources.
The cube fills the preview and adjusts its perspective when it is resized.
Edited source is shared in the URL's `#code=` fragment, keeping it out of HTTP
requests; existing `?code=` links still work.

The embedded example above remains the sine demo while the cube expansion is
unreleased. See [SDL and OpenGL](/extensions/sdl.html) for the current cube
source, runtime and asset setup, build flags, and error recovery.
