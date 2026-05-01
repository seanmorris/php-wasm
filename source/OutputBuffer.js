import { _Event } from "./_Event";

/**
 * Buffers output bytes until they should be emitted as an event.
 */
export class OutputBuffer
{
	/**
	 * Creates a new output buffer for an event target.
	 * @param {EventTarget & {[key: string]: unknown}} target Event target that receives flushed events.
	 * @param {string} eventType Event name to dispatch when the buffer flushes.
	 * @param {number} maxLength Maximum buffered byte length before an automatic flush.
	 */
	constructor(target, eventType, maxLength)
	{
		Object.defineProperty(this, 'target',    {value: target});
		Object.defineProperty(this, 'buffer',    {value: []});
		Object.defineProperty(this, 'eventType', {value: eventType});
		Object.defineProperty(this, 'maxLength', {value: maxLength});
		Object.defineProperty(this, 'decoder',   {value: new TextDecoder()});
		Object.defineProperty(this, 'queue',     {value: new Set});
	}

	/**
	 * Appends bytes to the internal output buffer.
	 * @param {...number} items Bytes to append to the buffer.
	 */
	push(...items)
	{
		this.buffer.push(...items);

		const end = this.buffer.length - 1;

		if(this.maxLength === -1 && this.buffer[end] === 10)
		{
			this.flush();
		}

		if(this.maxLength >= 0 && this.buffer.length >= this.maxLength)
		{
			this.flush();
		}
	}

	/**
	 * Emits the buffered output as a single event payload.
	 */
	flush()
	{
		if(!this.buffer.length)
		{
			return;
		}

		const detail = [this.decoder.decode(new Uint8Array(this.buffer))];
		const event = new _Event(this.eventType, {detail});

		if(this.target['on' + this.eventType])
		{
			if(this.target['on' + this.eventType](event) === false)
			{
				return;
			}
		}

		if(!this.target.dispatchEvent(event))
		{
			return;
		}

		this.buffer.splice(0);
	}
}
