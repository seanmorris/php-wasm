
/**
 * Lightweight CustomEvent fallback for runtimes that only expose Event.
 */
export const _Event = globalThis.CustomEvent ?? class extends globalThis.Event {
	constructor(name, options = {}) {
		super(name, options);
		this.detail = options.detail;
	}
};
