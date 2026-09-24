/* PHP License 3.01; see ../opengl/LICENSE. */
const phpSdlPointerFallback = LibraryManager.library.$requestPointerLock;
const phpSdlPointerDependencies = LibraryManager.library.$requestPointerLock__deps || [];
const phpSdlPointerExitFallback = LibraryManager.library.emscripten_exit_pointerlock;
const phpSdlPointerExitDependencies = LibraryManager.library.emscripten_exit_pointerlock__deps || [];

addToLibrary({
	$php_sdl_pointer__deps: ['$JSEvents', '$stringToNewUTF8', 'free', 'php_sdl_pointer_error']
	, $php_sdl_pointer: {
		id: 0
		, generation: 0
		, requested: false
		, scope: 0
		, pending: null
		, failure: ''
		, change: null
		, error: null

		/**
		 * Find lock ownership without mistaking a shadow host for its canvas.
		 * @returns {boolean} Whether SDL's actual canvas is locked.
		 */
		, locked: function() {
			const canvas = Module['canvas'];
			const root = canvas?.getRootNode?.();
			return !!root && root.pointerLockElement === canvas;
		}

		/**
		 * Keep obsolete requests from unlocking a replacement's desired lock.
		 * @returns {void}
		 */
		, release: function() {
			if(!this.requested && this.locked())
			{
				document.exitPointerLock?.();
			}
		}

		/**
		 * Send errors only to the native window that made this request.
		 * @param {object} request Window ID and generation captured before submission.
		 * @param {string} message Browser rejection or unavailable capability.
		 * @returns {void}
		 */
		, report: function(request, message) {
			if(request.id !== this.id || request.generation !== this.generation)
			{
				return;
			}
			const pointer = stringToNewUTF8(message);
			try
			{
				_php_sdl_pointer_error(this.id, pointer);
			}
			finally
			{
				_free(pointer);
			}
		}

		/**
		 * Retire a request while retaining any necessary late-lock observer.
		 * @param {object} request A completed or rejected submission.
		 * @returns {void}
		 */
		, finish: function(request) {
			this.pending.delete(request);
			this.release();
			this.unlisten();
		}

		/**
		 * Remove observers once neither a live mode nor an in-flight request needs them.
		 * @returns {void}
		 */
		, unlisten: function() {
			if(this.requested || this.pending?.size || !this.change)
			{
				return;
			}
			document.removeEventListener('pointerlockchange', this.change);
			document.removeEventListener('pointerlockerror', this.error, true);
			this.change = this.error = null;
		}

		/**
		 * Observe legacy void-returning implementations and late successful requests.
		 * Promise implementations report their more specific rejection separately.
		 * @returns {void}
		 */
		, listen: function() {
			if(this.change)
			{
				return;
			}
			this.change = () => {
				const acquired = this.locked();
				this.release();
				for(const request of this.pending)
				{
					if(request.legacy && acquired)
					{
						this.finish(request);
					}
				}
			};
			this.error = () => {
				for(const request of this.pending)
				{
					if(request.legacy)
					{
						this.report(request, 'Browser pointer lock request failed or was denied');
						this.finish(request);
						break;
					}
				}
			};
			document.addEventListener('pointerlockchange', this.change);
			// Populate SDL's error before ordinary application error listeners run.
			document.addEventListener('pointerlockerror', this.error, true);
		}
	}

	, $php_sdl_pointer_fallback__deps: phpSdlPointerDependencies
	, $php_sdl_pointer_fallback: phpSdlPointerFallback
	, $requestPointerLock__deps: ['$php_sdl_pointer', '$php_sdl_pointer_fallback']

	/**
	 * Observe browser completion for SDL's canvas, preserving the SDK's other targets.
	 * @param {Element} target Browser element resolved by the pinned SDK.
	 * @returns {number} Emscripten submission result; later denial sets SDL's error.
	 */
	, $requestPointerLock: function(target) {
		const state = php_sdl_pointer;
		if(target !== Module['canvas'])
		{
			return php_sdl_pointer_fallback(target);
		}
		if(!state.id || !state.requested)
		{
			return -2; // EMSCRIPTEN_RESULT_FAILED_NOT_DEFERRED
		}
		const request = {id: state.id, generation: state.generation, legacy: false};
		(state.pending ||= new Set()).add(request);
		state.listen();
		try
		{
			const result = target.requestPointerLock();
			if(result?.then)
			{
				Promise.resolve(result).then(() => state.finish(request), error => {
					state.report(request, `Browser pointer lock request failed: ${String(error)}`);
					state.finish(request);
				});
			}
			else
			{
				request.legacy = true;
			}
			return 0; // EMSCRIPTEN_RESULT_SUCCESS
		}
		catch(error)
		{
			state.failure = `Browser pointer lock request failed: ${String(error)}`;
			state.report(request, state.failure);
			state.finish(request);
			return -6; // EMSCRIPTEN_RESULT_FAILED
		}
	}

	, $php_sdl_pointer_exit_fallback__deps: phpSdlPointerExitDependencies
	, $php_sdl_pointer_exit_fallback: phpSdlPointerExitFallback
	, emscripten_exit_pointerlock__deps: ['$php_sdl_pointer', '$php_sdl_pointer_exit_fallback']

	/**
	 * A native SDL disable must not release another element's pointer lock.
	 * @returns {number} Emscripten exit result.
	 */
	, emscripten_exit_pointerlock: function() {
		if(!php_sdl_pointer.scope)
		{
			return php_sdl_pointer_exit_fallback();
		}
		php_sdl_pointer.release();
		return 0; // EMSCRIPTEN_RESULT_SUCCESS
	}

	, php_sdl_pointer_attach__deps: ['$php_sdl_pointer']
	, php_sdl_pointer_attach__sig: 'vi'

	/**
	 * Associate native window identity before any user focus callback can run.
	 * @param {number} id SDL window ID, never a raw native pointer.
	 * @returns {void}
	 */
	, php_sdl_pointer_attach: function(id) {
		php_sdl_pointer.id = id;
	}

	, php_sdl_pointer_begin__deps: ['$php_sdl_pointer', '$JSEvents', '$requestPointerLock']
	, php_sdl_pointer_begin__sig: 'iii'

	/**
	 * Validate capability and scope native mode changes to SDL's canvas.
	 * @param {number} id Focused native window ID, or zero for disabling.
	 * @param {number} enabled Native boolean requested mode.
	 * @returns {number} One if the native mode change may proceed, zero on error.
	 */
	, php_sdl_pointer_begin: function(id, enabled) {
		const state = php_sdl_pointer;
		if(enabled && id !== state.id)
		{
			state.report(state, 'Browser pointer lock requires the current SDL window');
			return 0;
		}
		if(enabled && typeof Module['canvas']?.requestPointerLock !== 'function')
		{
			state.report(state, 'Browser pointer lock is unavailable or unsupported');
			return 0;
		}
		state.generation++;
		state.requested = !!enabled;
		state.failure = '';
		if(!enabled)
		{
			JSEvents.deferredCalls = JSEvents.deferredCalls?.filter(call =>
				call.targetFunction !== requestPointerLock || call.argsList[0] !== Module['canvas']) || [];
			state.release();
			state.unlisten();
		}
		state.scope++;
		return 1;
	}

	, php_sdl_pointer_end__deps: ['$php_sdl_pointer']
	, php_sdl_pointer_end__sig: 'i'

	/** @returns {number} One on submission, zero for synchronous browser failure. */
	, php_sdl_pointer_end: function() {
		const state = php_sdl_pointer;
		state.scope--;
		if(state.failure)
		{
			state.report(state, state.failure);
			return 0;
		}
		return 1;
	}

	, php_sdl_pointer_owns__deps: ['$php_sdl_pointer']
	, php_sdl_pointer_owns__sig: 'ii'

	/**
	 * Select cleanup belonging to this window or the entire video subsystem.
	 * @param {number} id Native SDL window ID, or zero for global cleanup.
	 * @returns {number} One for matching ownership, zero for a different window.
	 */
	, php_sdl_pointer_owns: function(id) {
		return +(id === 0 || id === php_sdl_pointer.id);
	}

	, php_sdl_pointer_detach__deps: ['$php_sdl_pointer']
	, php_sdl_pointer_detach__sig: 'v'

	/** @returns {void} Retire window identity before native storage is freed. */
	, php_sdl_pointer_detach: function() {
		php_sdl_pointer.id = 0;
	}
});
