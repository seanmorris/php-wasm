export const _Event = globalThis.CustomEvent ?? class extends globalThis.Event {
	/**
	 * Creates an event instance with an optional `detail` payload.
	 * @param {string} name Event name.
	 * @param {{detail?: unknown}} options Event initialization options.
	 */
	constructor(name, options = {}) {
		super(name, options);
		this.detail = options.detail;
	}
};
