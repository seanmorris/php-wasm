export const _Event = globalThis.CustomEvent ?? class extends globalThis.Event {
	/**
	 * Creates an event instance with an optional `detail` payload.
	 * @param {string} name Event name.
	 * @param {{detail?: object|string|number|boolean|Array<string>|undefined}} options Event initialization options.
	 */
	constructor(name, options = {}) {
		super(name, /** @type {EventInit} */ (options));
		this.detail = options.detail;
	}
};
