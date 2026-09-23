/* PHP License 3.01; see ../opengl/LICENSE. */
// Keep the SDK's proxy path for transferred canvases. Ordinary DOM canvases
// must not roundtrip through target.id: the modern selector lookup requires
// a CSS selector, and canvases can have no ID or live inside a shadow root.
const phpSdlCanvasSizeFallback = LibraryManager.library.$getCanvasElementSize;
const phpSdlCanvasSizeDependencies = LibraryManager.library.$getCanvasElementSize__deps;
const phpSdlRestoreStyleFallback = LibraryManager.library.$registerRestoreOldStyle;
const phpSdlRestoreStyleDependencies = LibraryManager.library.$registerRestoreOldStyle__deps;

addToLibrary({
	$php_sdl_canvas_size_fallback__deps: phpSdlCanvasSizeDependencies
	, $php_sdl_canvas_size_fallback: phpSdlCanvasSizeFallback
	, $getCanvasElementSize__deps: ['$php_sdl_canvas_size_fallback']

	/**
	 * Read a DOM canvas without changing its identity or querying the document.
	 * @param {HTMLCanvasElement} target The canvas supplied to the SDK helper.
	 * @returns {number[]} Canvas width and height in pixels.
	 */
	, $getCanvasElementSize: function(target) {
		if(!target.controlTransferredOffscreen)
		{
			return [target.width, target.height];
		}
		return php_sdl_canvas_size_fallback(target);
	}

	, $php_sdl_fullscreen: {owner: 0, restore: null}
	, $php_sdl_restore_style_fallback__deps: phpSdlRestoreStyleDependencies
	, $php_sdl_restore_style_fallback: phpSdlRestoreStyleFallback
	, $registerRestoreOldStyle__deps: [
		'$php_sdl_fullscreen', '$php_sdl_restore_style_fallback'
		, '$getCanvasElementSize', '$setCanvasElementSize'
		, '$currentFullscreenStrategy', '$callCanvasResizedCallback']

	/**
	 * Keep SDL's fullscreen style snapshot cancellable before native teardown.
	 * The SDK's delayed resize callback otherwise retains freed window data.
	 * @param {HTMLCanvasElement} canvas Canvas entering fullscreen.
	 * @returns {Function} Restore after browser exit, or immediately when forced.
	 */
	, $registerRestoreOldStyle: function(canvas) {
		if(canvas !== Module['canvas'])
		{
			return php_sdl_restore_style_fallback(canvas);
		}
		php_sdl_fullscreen.restore?.(true);
		const size = getCanvasElementSize(canvas);
		const scroll = document.body.scroll;
		const styles = [
			[canvas, ['width', 'height', 'backgroundColor', 'imageRendering'
				, 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'
				, 'marginLeft', 'marginRight', 'marginTop', 'marginBottom']]
			, [document.body, ['backgroundColor', 'margin']]
			, [document.documentElement, ['overflow']]
		].flatMap(([element, names]) => names.map(name => [element, name, element.style[name]]));
		let live = true;
		const restore = (forced = false) => {
			if(!live || (!forced && (document.fullscreenElement || document.webkitFullscreenElement)))
			{
				return;
			}
			live = false;
			document.removeEventListener('fullscreenchange', onChange);
			document.removeEventListener('webkitfullscreenchange', onChange);
			if(php_sdl_fullscreen.restore === restore)
			{
				php_sdl_fullscreen.restore = null;
			}
			setCanvasElementSize(canvas, size[0], size[1]);
			for(const [element, name, value] of styles)
			{
				element.style[name] = value;
			}
			document.body.scroll = scroll;
			canvas.GLctxObject?.GLctx.viewport(0, 0, size[0], size[1]);
			if(forced)
			{
				if(currentFullscreenStrategy)
				{
					currentFullscreenStrategy.canvasResizedCallback = 0;
					currentFullscreenStrategy.canvasResizedCallbackUserData = 0;
				}
			}
			else
			{
				callCanvasResizedCallback(currentFullscreenStrategy);
			}
		};
		const onChange = () => restore();
		document.addEventListener('fullscreenchange', onChange);
		document.addEventListener('webkitfullscreenchange', onChange);
		php_sdl_fullscreen.restore = restore;
		return restore;
	}

	, php_sdl_fullscreen_claim__deps: ['$php_sdl_fullscreen']
	, php_sdl_fullscreen_claim__sig: 'vi'

	/**
	 * Associate the pending fullscreen request with its native SDL window.
	 * @param {number} window Native window identity, never exposed to PHP.
	 * @returns {void}
	 */
	, php_sdl_fullscreen_claim: function(window) {
		php_sdl_fullscreen.owner = window;
	}

	, php_sdl_fullscreen_cleanup__deps: ['$php_sdl_fullscreen', '$JSEvents', '$JSEvents_requestFullscreen']
	, php_sdl_fullscreen_cleanup__sig: 'vi'

	/**
	 * Cancel delayed work before freeing its window or resetting the subsystem.
	 * @param {number} window Native window identity, or zero for video teardown.
	 * @returns {void}
	 */
	, php_sdl_fullscreen_cleanup: function(window) {
		if(window && php_sdl_fullscreen.owner && php_sdl_fullscreen.owner !== window)
		{
			return;
		}
		JSEvents.removeDeferredCalls?.(JSEvents_requestFullscreen);
		php_sdl_fullscreen.restore?.(true);
		php_sdl_fullscreen.owner = 0;
	}

	, php_sdl_bind_canvas__deps: ['$specialHTMLTargets']
	, php_sdl_bind_canvas__sig: 'v'

	/**
	 * Route SDL's default event selector to this runtime's supplied canvas.
	 * Emscripten keeps this target map local to each module instance, including
	 * canvases with arbitrary IDs or canvases inside a shadow root.
	 * @returns {void}
	 */
	, php_sdl_bind_canvas: function() {
		if(Module['canvas'])
		{
			specialHTMLTargets['#canvas'] = Module['canvas'];
		}
	}

	, php_webgl_context_version__deps: ['$GL']
	, php_webgl_context_version__sig: 'i'

	/**
	 * Read the pinned SDK's context version, including during context loss.
	 * @returns {number} WebGL version, or zero when no context is current.
	 */
	, php_webgl_context_version: function() {
		return GL.currentContext ? GL.currentContext.version : 0;
	}

	, $php_webgl_lifetimes__deps: ['$GL']
	, $php_webgl_lifetimes: {
		contexts: null
		, objects: null
		// Must match php_webgl_object_type in opengl/php_webgl.h.
		, tables: ['vaos', 'framebuffers', 'programs', 'shaders', 'renderbuffers', 'textures', 'buffers', 'samplers']

		/**
		 * Watch each browser context once, across SDL context recreation.
		 * Weak keys avoid retaining contexts or GPU objects after teardown.
		 * @returns {object} The current context's loss generation.
		 */
		, current: function() {
			if(!this.contexts)
			{
				this.contexts = new WeakMap;
				this.objects = new WeakMap;
			}
			const context = GL.currentContext.GLctx;
			let record = this.contexts.get(context);
			if(!record)
			{
				record = {epoch: 0};
				this.contexts.set(context, record);
				context.canvas.addEventListener('webglcontextlost', () => record.epoch++);
				context.canvas.addEventListener('webglcontextrestored', () => {
					// Native bindings reset on restoration; mirror that in SDK caches.
					context.currentPixelPackBufferBinding = 0;
					context.currentPixelUnpackBufferBinding = 0;
					context.currentArrayBufferBinding = 0;
					context.currentElementArrayBufferBinding = 0;
					context.currentProgram = null;
					if(!GL.currentContext || GL.currentContext.GLctx === context)
					{
						GL.unpackAlignment = 4;
						GL.unpackRowLength = 0;
					}
					for(const owner of Object.values(GL.contexts))
					{
						if(owner?.GLctx !== context || !GL.initExtensions)
						{
							continue;
						}
						const automatic = owner.attributes.enableExtensionsByDefault;
						if(automatic === undefined || automatic)
						{
							owner.initExtensionsDone = false;
							GL.initExtensions(owner);
						}
					}
				});
			}
			return record;
		}
	}

	, php_webgl_track_epoch__deps: ['$php_webgl_lifetimes']
	, php_webgl_track_epoch__sig: 'vii'

	/**
	 * Associate a PHP-owned SDK name with the browser generation that made it.
	 * @param {number} type Native object kind.
	 * @param {number} id SDK object name.
	 * @returns {void}
	 */
	, php_webgl_track_epoch: function(type, id) {
		const context = php_webgl_lifetimes.current();
		const object = GL[php_webgl_lifetimes.tables[type]][id];
		if(object)
		{
			php_webgl_lifetimes.objects.set(object, {context, epoch: context.epoch});
		}
	}

	, php_webgl_prepare_delete__deps: ['$php_webgl_lifetimes']
	, php_webgl_prepare_delete__sig: 'viii'

	/**
	 * Retire invalidated SDK names without passing old WebGL objects to a
	 * restored context. Zeroing the private C copy preserves native no-op deletes.
	 * @param {number} type Native object kind.
	 * @param {number} count Number of names.
	 * @param {number} ids Checked private uint32 buffer.
	 * @returns {void}
	 */
	, php_webgl_prepare_delete: function(type, count, ids) {
		if(!php_webgl_lifetimes.objects)
		{
			return;
		}
		const table = GL[php_webgl_lifetimes.tables[type]];
		for(let index = 0; index < count; index++)
		{
			const offset = (ids >>> 2) + index;
			const id = HEAPU32[offset];
			const object = table[id];
			const record = object && php_webgl_lifetimes.objects.get(object);
			if(record && record.epoch !== record.context.epoch)
			{
				table[id] = null;
				HEAPU32[offset] = 0;
				php_webgl_lifetimes.objects.delete(object);
			}
		}
	}

	, $php_webgl_pixel_view__deps: ['$heapObjectForWebGLType', '$toTypedArrayIndex']

	/**
	 * Create the exact typed view already range-checked by the PHP binding.
	 * @param {number} type GLES pixel element type.
	 * @param {number} data Aligned native byte pointer.
	 * @param {number} bytes Checked span, including skips and padding.
	 * @returns {ArrayBufferView} A view into the current Wasm heap.
	 */
	, $php_webgl_pixel_view: function(type, data, bytes) {
		const heap = heapObjectForWebGLType(type);
		const start = toTypedArrayIndex(data, heap);
		return heap.subarray(start, start + bytes / heap.BYTES_PER_ELEMENT);
	}

	, php_webgl_texture_layout__deps: ['$GL', '$php_webgl_pixel_view']
	, php_webgl_texture_layout__sig: 'viiiiiiiiiiiiii'

	/**
	 * Supply complete custom row/image layouts, which the pinned SDK's
	 * compatibility view helper otherwise truncates before WebGL reads them.
	 * @param {number} target Texture target.
	 * @param {number} level Mipmap level.
	 * @param {number} x Destination column.
	 * @param {number} y Destination row.
	 * @param {number} z Destination layer.
	 * @param {number} width Upload width.
	 * @param {number} height Upload height.
	 * @param {number} depth Upload depth.
	 * @param {number} internal Texture storage format.
	 * @param {number} format Source pixel format.
	 * @param {number} type Source pixel element type.
	 * @param {number} data Checked native byte pointer.
	 * @param {number} bytes Complete checked byte span.
	 * @param {number} mode Bit 0 selects subimage; bit 1 selects 3D.
	 * @returns {void}
	 */
	, php_webgl_texture_layout: function(target, level, x, y, z, width, height, depth, internal, format, type, data, bytes, mode) {
		const pixels = php_webgl_pixel_view(type, data, bytes);
		if(mode === 3)
		{
			GLctx.texSubImage3D(target, level, x, y, z, width, height, depth, format, type, pixels);
		}
		else if(mode === 2)
		{
			GLctx.texImage3D(target, level, internal, width, height, depth, 0, format, type, pixels);
		}
		else if(mode === 1)
		{
			GLctx.texSubImage2D(target, level, x, y, width, height, format, type, pixels);
		}
		else
		{
			GLctx.texImage2D(target, level, internal, width, height, 0, format, type, pixels);
		}
	}

	, php_webgl_read_layout__deps: ['$GL', '$php_webgl_pixel_view']
	, php_webgl_read_layout__sig: 'viiiiiiii'

	/**
	 * Read into the complete checked PACK span, independent of UNPACK state.
	 * @param {number} x Source column.
	 * @param {number} y Source row.
	 * @param {number} width Read width.
	 * @param {number} height Read height.
	 * @param {number} format Destination pixel format.
	 * @param {number} type Destination element type.
	 * @param {number} data Checked native destination pointer.
	 * @param {number} bytes Complete checked destination span.
	 * @returns {void}
	 */
	, php_webgl_read_layout: function(x, y, width, height, format, type, data, bytes) {
		GLctx.readPixels(x, y, width, height, format, type, php_webgl_pixel_view(type, data, bytes));
	}

	, php_webgl_compressed_empty__deps: ['$GL']
	, php_webgl_compressed_empty__sig: 'viiiiiiiiii'

	/**
	 * Preserve empty client-data uploads with the pinned SDK. Its 2D wrapper
	 * selects the PBO overload for size zero; its 3D wrapper treats zero as
	 * "the rest of the heap". An empty view supplies the exact native byte span.
	 * @param {number} target Texture target.
	 * @param {number} level Mipmap level.
	 * @param {number} x Destination column.
	 * @param {number} y Destination row.
	 * @param {number} z Destination layer.
	 * @param {number} width Upload width.
	 * @param {number} height Upload height.
	 * @param {number} depth Upload depth.
	 * @param {number} format Compressed format.
	 * @param {number} mode Bit 0 selects subimage; bit 1 selects 3D.
	 * @returns {void}
	 */
	, php_webgl_compressed_empty: function(target, level, x, y, z, width, height, depth, format, mode) {
		const data = new Uint8Array(0);
		if(mode === 3)
		{
			GLctx.compressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, data);
		}
		else if(mode === 2)
		{
			GLctx.compressedTexImage3D(target, level, format, width, height, depth, 0, data);
		}
		else if(mode === 1)
		{
			GLctx.compressedTexSubImage2D(target, level, x, y, width, height, format, data);
		}
		else
		{
			GLctx.compressedTexImage2D(target, level, format, width, height, 0, data);
		}
	}
});
