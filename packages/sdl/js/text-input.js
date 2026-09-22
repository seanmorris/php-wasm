/* PHP License 3.01; see ../opengl/LICENSE. */
addToLibrary({
	$php_sdl_text__deps: ['$JSEvents', '$stringToNewUTF8', 'free', 'SDL_ResetKeyboard', 'php_sdl_text_send', 'php_sdl_text_size', 'php_sdl_text_unavailable']
	, $php_sdl_text: {
		id: 0
		, requested: false
		, field: null
		, context: null
		, previousContext: null
		, selectionBounds: null
		, rect: [0, 0, 1, 16]
		, composing: false
		, lastEdit: ''
		, pending: null
		, timer: null
		, observer: null
		, listeners: []
		, fieldListeners: []
		, native: []

		/**
		 * Encode Unicode scalars before calling SDL's native event senders.
		 * @param {string} text Browser text, possibly with unmatched surrogates.
		 * @param {boolean} editing True for preedit, false for committed text.
		 * @param {number} start Selected preedit offset in codepoints.
		 * @param {number} length Selected preedit length in codepoints.
		 * @returns {void}
		 */
		, send: function(text, editing = false, start = 0, length = 0) {
			text = text.replace(/[\uD800-\uDFFF]/gu, '\uFFFD').replace(/\0/g, '');
			const pointer = stringToNewUTF8(text);
			try
			{
				_php_sdl_text_send(this.id, pointer, +editing, start, length);
			}
			finally
			{
				_free(pointer);
			}
		}

		/**
		 * Register a DOM listener with its matching teardown operation.
		 * @param {EventTarget} target Browser event source.
		 * @param {string} type DOM event name.
		 * @param {Function} listener Handler owned by this SDL window.
		 * @returns {void}
		 */
		, listen: function(target, type, listener) {
			target.addEventListener(type, listener);
			const listeners = target === this.field || target === this.context ? this.fieldListeners : this.listeners;
			listeners.push(() => target.removeEventListener(type, listener));
		}

		/**
		 * Read focus inside the element's document or shadow root.
		 * @param {Element} element Possible active element.
		 * @returns {boolean} Whether the element owns focus in its root.
		 */
		, focused: function(element) {
			return !!element && element.getRootNode().activeElement === element;
		}

		/**
		 * Release native held keys when focus leaves the canvas and its IME field.
		 * Wait until DOM focus settles so switching to the owned field is seamless.
		 * @returns {void}
		 */
		, releaseKeys: function() {
			const id = this.id;
			queueMicrotask(() => {
				if(id && this.id === id && !this.focused(Module['canvas']) && !this.focused(this.field))
				{
					_SDL_ResetKeyboard();
				}
			});
		}

		/**
		 * Position the IME target using SDL window coordinates and canvas CSS.
		 * @returns {void}
		 */
		, position: function() {
			if(!this.field && !this.context)
			{
				return;
			}
			const canvas = Module['canvas'];
			const bounds = canvas.getBoundingClientRect();
			const sx = bounds.width / (_php_sdl_text_size(this.id, 0) || 1);
			const sy = bounds.height / (_php_sdl_text_size(this.id, 1) || 1);
			const [x, y, width, height] = this.rect;
			this.selectionBounds = new DOMRect(
				bounds.left + x * sx, bounds.top + y * sy
				, Math.max(1, width * sx), Math.max(1, height * sy)
			);
			if(this.context)
			{
				this.context.updateControlBounds(bounds);
				this.context.updateSelectionBounds(this.selectionBounds);
				return;
			}
			Object.assign(this.field.style, {
				left: (bounds.left + x * sx) + 'px'
				, top: (bounds.top + y * sy) + 'px'
				, width: Math.max(1, width * sx) + 'px'
				, height: Math.max(1, height * sy) + 'px'
			});
		}

		/**
		 * Convert a DOM UTF-16 offset without placing a caret inside a surrogate.
		 * @param {string} text Current preedit text.
		 * @param {number} offset Browser selection offset in UTF-16 code units.
		 * @returns {number} Offset in Unicode codepoints.
		 */
		, offset: function(text, offset) {
			const unit = text.charCodeAt(offset);
			const previous = text.charCodeAt(offset - 1);
			if(unit >= 0xDC00 && unit <= 0xDFFF && previous >= 0xD800 && previous <= 0xDBFF)
			{
				offset--;
			}
			return [...text.slice(0, offset)].length;
		}

		/**
		 * Report preedit text with DOM UTF-16 selection converted to codepoints.
		 * @returns {void}
		 */
		, edit: function() {
			const target = this.context || this.field;
			if(!target || !this.composing)
			{
				return;
			}
			const text = this.context ? target.text : target.value;
			const a = this.offset(text, target.selectionStart);
			const b = this.offset(text, target.selectionEnd);
			const start = Math.min(a, b);
			const end = Math.max(a, b);
			const signature = JSON.stringify([text, start, end]);
			if(this.lastEdit === signature)
			{
				return;
			}
			this.lastEdit = signature;
			this.send(text, true, start, end - start);
		}

		/**
		 * Empty committed text while leaving application text storage to PHP.
		 * @returns {void}
		 */
		, clear: function() {
			if(this.context)
			{
				if(this.context.text.length)
				{
					this.context.updateText(0, this.context.text.length, '');
				}
				if(this.context.selectionStart || this.context.selectionEnd)
				{
					this.context.updateSelection(0, 0);
				}
			}
			if(this.field)
			{
				this.field.value = '';
			}
		}

		/**
		 * Clear a cancelled composition without committing its unfinished text.
		 * @param {boolean} notify Send the native preedit-clear event.
		 * @returns {void}
		 */
		, cancel: function(notify = true) {
			if(this.composing && notify)
			{
				this.send('', true);
			}
			this.composing = false;
			this.lastEdit = '';
			this.pending = null;
			clearTimeout(this.timer);
			this.timer = null;
			this.clear();
		}

		/**
		 * Use direct canvas editing where the browser implements EditContext.
		 * The SDK key callback still delivers physical key events.
		 * @returns {void}
		 */
		, createContext: function() {
			const canvas = Module['canvas'];
			const context = this.context = new EditContext();
			this.previousContext = canvas.editContext;
			canvas.editContext = context;
			this.listen(context, 'compositionstart', () => {
				this.cancel();
				this.composing = true;
				this.send('', true);
			});
			this.listen(context, 'compositionend', () => {
				if(!this.composing)
				{
					return;
				}
				const text = context.text;
				this.composing = false;
				this.lastEdit = '';
				this.send('', true);
				if(text)
				{
					this.send(text);
				}
				this.clear();
			});
			this.listen(context, 'textupdate', event => {
				if(this.composing)
				{
					this.edit();
					return;
				}
				if(event.text)
				{
					this.send(event.text);
				}
				this.clear();
			});
			this.listen(context, 'characterboundsupdate', event => {
				this.position();
				const start = Math.min(event.rangeStart, context.text.length);
				const end = Math.min(event.rangeEnd, context.text.length);
				// SDL exposes one candidate rectangle, not per-glyph layout.
				const bounds = Array.from({length: Math.max(0, end - start)}, () => this.selectionBounds);
				context.updateCharacterBounds(start, bounds);
			});
		}

		/**
		 * Activate a browser editing target only after an explicit SDL request.
		 * Default SDL keypress input keeps working without opening a text field.
		 * @returns {void}
		 */
		, focus: function() {
			const canvas = Module['canvas'];
			if(!this.requested || !this.id || !canvas?.isConnected)
			{
				return;
			}
			if(!this.field && !this.context && typeof EditContext === 'function')
			{
				this.createContext();
			}
			if(!this.field && !this.context)
			{
				const field = this.field = document.createElement('textarea');
				field.setAttribute('aria-label', 'SDL text input');
				field.setAttribute('autocomplete', 'off');
				field.setAttribute('autocapitalize', 'off');
				field.spellcheck = false;
				field.wrap = 'off';
				field.tabIndex = -1;
				Object.assign(field.style, {
					position: 'fixed', opacity: '0', pointerEvents: 'none'
					, padding: '0', border: '0', margin: '0', resize: 'none'
					, fontSize: '16px', overflow: 'hidden'
				});
				canvas.parentNode.append(field);
				this.listen(field, 'compositionstart', () => {
					this.cancel();
					this.composing = true;
					this.send('', true);
				});
				this.listen(field, 'compositionend', event => {
					if(!this.composing)
					{
						return;
					}
					this.composing = false;
					this.lastEdit = '';
					this.send('', true);
					if(event.data)
					{
						this.send(event.data);
					}
					const pending = this.pending = event.data;
					clearTimeout(this.timer);
					this.timer = setTimeout(() => {
						if(this.pending === pending)
						{
							this.pending = null;
						}
						this.timer = null;
					}, 0);
					field.value = '';
				});
				this.listen(field, 'input', event => {
					if(this.composing || event.isComposing)
					{
						this.edit();
						return;
					}
					const text = event.data ?? field.value;
					const duplicate = this.pending !== null && this.pending === text
						&& ['insertText', 'insertCompositionText', 'insertFromComposition'].includes(event.inputType);
					this.pending = null;
					if(text && !duplicate && !event.inputType?.startsWith('delete'))
					{
						this.send(text);
					}
					field.value = '';
				});
				this.listen(field, 'keydown', () => this.pending = null);
				this.listen(field, 'blur', () => {
					this.cancel();
					this.releaseKeys();
				});
			}
			if(!this.observer)
			{
				this.observer = new ResizeObserver(() => this.position());
				this.observer.observe(canvas);
			}
			this.position();
			if(this.context)
			{
				canvas.focus({preventScroll: true});
			}
			else if(canvas.getRootNode().fullscreenElement === canvas || document.webkitFullscreenElement === canvas)
			{
				_php_sdl_text_unavailable();
			}
			else
			{
				this.field.focus({preventScroll: true});
			}
		}

		/**
		 * Wrap only the just-created SDL driver's keyboard handlers.
		 * Its keypress registration follows keydown/up and shares their userdata.
		 * Keep SDK dispatch/cleanup and native key state, but allow the owned
		 * editing target's default action and normalize legacy charCode input.
		 * Ignore keyboard events while another page control has focus.
		 * @returns {void}
		 */
		, keyboard: function() {
			const handlers = JSEvents.eventHandlers;
			const press = [...handlers].reverse().find(handler => handler.eventTypeString === 'keypress');
			if(!press)
			{
				return;
			}
			for(const handler of handlers)
			{
				if(handler.userData !== press.userData || handler.target !== press.target
					|| !['keydown', 'keyup', 'keypress'].includes(handler.eventTypeString)) {
					continue;
					}
				const original = handler.handlerFunc;
				const direct = handler.eventListenerFunc === original;
				handler.handlerFunc = event => {
					const target = event.composedPath?.()[0] ?? event.target;
					const canvas = Module['canvas'];
					if(!this.focused(canvas) && !this.focused(this.field))
					{
						return;
					}
					const editing = this.field && target === this.field
						|| this.context && target === canvas && canvas.editContext === this.context;
					if(editing && event.type === 'keypress')
					{
						return;
					}
					let charCode = event.charCode;
					if(event.type === 'keypress')
					{
						const characters = [...(event.key ?? '')];
						if(characters.length === 1)
						{
							charCode = characters[0].codePointAt(0);
						}
						if(charCode >= 0xD800 && charCode <= 0xDFFF)
						{
							charCode = 0xFFFD;
						}
					}
					if(!editing && charCode === event.charCode)
					{
						return original(event);
					}
					original(new Proxy(event, {
						get: (target, key) => {
							if(key === 'charCode')
							{
								return charCode;
							}
							if(key === 'preventDefault' && editing)
							{
								return () => {};
							}
							const value = Reflect.get(target, key, target);
							return typeof value === 'function' ? value.bind(target) : value;
						}
					}));
				};
				if(direct)
				{
					handler.target.removeEventListener(handler.eventTypeString, original, handler.useCapture);
					handler.eventListenerFunc = handler.handlerFunc;
					handler.target.addEventListener(handler.eventTypeString, handler.eventListenerFunc, handler.useCapture);
				}
				this.native.push(() => {
					if(direct)
					{
						handler.target.removeEventListener(handler.eventTypeString, handler.eventListenerFunc, handler.useCapture);
						handler.eventListenerFunc = original;
						handler.target.addEventListener(handler.eventTypeString, original, handler.useCapture);
					}
					handler.handlerFunc = original;
				});
			}
		}

		/**
		 * Remove the text field without moving focus away from another control.
		 * @param {boolean} restoreFocus Return owned focus to the canvas.
		 * @returns {void}
		 */
		, remove: function(restoreFocus) {
			const canvas = Module['canvas'];
			const focused = this.focused(this.context ? canvas : this.field);
			this.cancel(restoreFocus);
			for(const remove of this.fieldListeners.splice(0))
			{
				remove();
			}
			this.observer?.disconnect();
			this.observer = null;
			if(this.context && canvas.editContext === this.context)
			{
				canvas.editContext = this.previousContext;
			}
			this.context = null;
			this.previousContext = null;
			this.selectionBounds = null;
			this.field?.remove();
			this.field = null;
			if(restoreFocus && focused)
			{
				Module['canvas']?.focus({preventScroll: true});
			}
		}
	}

	, php_sdl_text_attach__deps: ['$php_sdl_text']
	, php_sdl_text_attach__sig: 'vi'

	/**
	 * Attach browser handling immediately after native SDL window creation.
	 * @param {number} id SDL window ID, not a native address.
	 * @returns {void}
	 */
	, php_sdl_text_attach: function(id) {
		const text = php_sdl_text;
		if(text.id === id)
		{
			return;
		}
		text.id = id;
		text.keyboard();
		const canvas = Module['canvas'];
		if(!canvas)
		{
			return;
		}
		text.listen(canvas, 'click', () => text.focus());
		text.listen(canvas, 'focus', () => {
			queueMicrotask(() => {
				if(text.focused(canvas))
				{
					text.focus();
				}
			});
		});
		text.listen(window, 'resize', () => text.position());
		text.listen(window, 'scroll', () => text.position());
		text.listen(window, 'blur', () => text.cancel());
		text.listen(canvas, 'blur', () => {
			text.releaseKeys();
			if(text.context)
			{
				text.cancel();
			}
		});
		text.listen(document, 'fullscreenchange', () => {
			if(text.focused(canvas) || text.focused(text.field))
			{
				text.focus();
			}
		});
		text.focus();
	}

	, php_sdl_text_start__deps: ['$php_sdl_text']
	, php_sdl_text_start__sig: 'v'

	/**
	 * Start the editable browser transport for the focused SDL window.
	 * @returns {void}
	 */
	, php_sdl_text_start: function() {
		php_sdl_text.requested = true;
		php_sdl_text.focus();
	}

	, php_sdl_text_stop__deps: ['$php_sdl_text']
	, php_sdl_text_stop__sig: 'v'

	/**
	 * Stop composition and return focus only when the owned field held it.
	 * @returns {void}
	 */
	, php_sdl_text_stop: function() {
		php_sdl_text.requested = false;
		php_sdl_text.remove(true);
	}

	, php_sdl_text_detach__deps: ['$php_sdl_text']
	, php_sdl_text_detach__sig: 'vi'

	/**
	 * Cancel pending input and native-handler wrappers before SDL teardown.
	 * @param {number} id SDL window ID, or zero for subsystem/request cleanup.
	 * @returns {void}
	 */
	, php_sdl_text_detach: function(id) {
		const text = php_sdl_text;
		if(id && id !== text.id)
		{
			return;
		}
		text.requested = false;
		text.remove(false);
		for(const remove of text.listeners.splice(0))
		{
			remove();
		}
		for(const restore of text.native.splice(0))
		{
			restore();
		}
		text.id = 0;
		text.rect = [0, 0, 1, 16];
	}

	, php_sdl_text_rect__deps: ['$php_sdl_text']
	, php_sdl_text_rect__sig: 'viiii'

	/**
	 * Store the SDL candidate-window hint in logical window coordinates.
	 * @param {number} x Left edge.
	 * @param {number} y Top edge.
	 * @param {number} width Rectangle width.
	 * @param {number} height Rectangle height.
	 * @returns {void}
	 */
	, php_sdl_text_rect: function(x, y, width, height) {
		if(!php_sdl_text.id)
		{
			return;
		}
		php_sdl_text.rect = [x, y, width, height];
		php_sdl_text.position();
	}
});
