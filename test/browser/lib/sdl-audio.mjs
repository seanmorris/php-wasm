import {expect} from '@playwright/test';
import {start} from './sdl-bindings.mjs';

/**
 * Observe real Web Audio output without replacing SDL's native mixer callback.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {object} options Optional benchmark instrumentation.
 * @param {boolean} options.measure Record requested callback timings and PCM.
 * @returns {Promise<void>} Resolves after the isolated PHP runtime starts.
 */
export const startAudio = async (page, {measure = false} = {}) => {
	await page.addInitScript(({measure}) => {
		window.audioContexts = [];
		window.audioProcessors = [];
		window.audioSamples = 0;
		window.audioCallbacks = 0;
		/**
		 * Store bounded benchmark samples after native mixing has completed.
		 * @param {AudioProcessingEvent} event Actual output buffer.
		 * @param {number} started Callback entry time.
		 * @param {number} callbackMs Time inside SDL's callback.
		 */
		const record = (event, started, callbackMs) => {
			const measurement = window.audioMeasurement;
			if(!measurement)
			{ return; }
			const intervalMs = measurement.lastStarted === null ? null : started - measurement.lastStarted;
			measurement.lastStarted = started;
			if(measurement.skip-- > 0)
			{ return; }
			let peak = 0;
			let energy = 0;
			const buffer = event.outputBuffer;
			for(let channel = 0; channel < buffer.numberOfChannels; channel++)
			{
				for(const sample of buffer.getChannelData(channel))
				{
					peak = Math.max(peak, Math.abs(sample));
					energy += sample * sample;
				}
			}
			measurement.rows.push({
				startedMs: started, intervalMs, callbackMs
				, bufferMs: buffer.duration * 1000, playbackTime: event.playbackTime
				, frames: buffer.length
				, channels: buffer.numberOfChannels
				, sampleRate: buffer.sampleRate
				, peak
				, rms: Math.sqrt(energy / (buffer.length * buffer.numberOfChannels))
			});
			if(measurement.rows.length === measurement.target)
			{
				window.audioMeasurement = null;
				measurement.resolve(measurement.rows);
			}
		};
		const NativeAudioContext = window.AudioContext;
		window.AudioContext = class extends NativeAudioContext {
			constructor(...args) {
				super(...args);
				window.audioContexts.push(this);
			}

			createScriptProcessor(...args) {
				const node = super.createScriptProcessor(...args);
				const processor = {connected: false};
				window.audioProcessors.push(processor);
				const connect = node.connect;
				const disconnect = node.disconnect;
				node.connect = function(...targets) {
					const result = connect.apply(this, targets);
					processor.connected = true;
					return result;
				};
				node.disconnect = function(...targets) {
					const result = disconnect.apply(this, targets);
					processor.connected = false;
					return result;
				};
				const descriptor = Object.getOwnPropertyDescriptor(ScriptProcessorNode.prototype, 'onaudioprocess');
				Object.defineProperty(node, 'onaudioprocess', {
					set(callback) {
						descriptor.set.call(node, event => {
							const started = measure ? performance.now() : 0;
							callback(event);
							const elapsed = measure ? performance.now() - started : 0;
							window.audioCallbacks++;
							if(event.outputBuffer.getChannelData(0).some(sample => Math.abs(sample) > .001))
							{
								window.audioSamples++;
							}
							if(measure)
							{ record(event, started, elapsed); }
						});
					}
				});
				return node;
			}
		};
	}, {measure});
	await start(page);
	await page.evaluate(() => {
		const button = document.createElement('button');
		button.textContent = 'Resume audio';
		button.onclick = () => window.audioContexts.forEach(context => {
			if(context.state !== 'closed')
			{ context.resume(); }
		});
		document.body.append(button);
	});
};

/**
 * Resume the device and wait for its native conversion-buffer initialization.
 * @param {import('@playwright/test').Page} page Browser with an open mixer.
 * @returns {Promise<void>} Resolves after a real Web Audio callback completes.
 */
export const primeAudio = async page => {
	const previous = await page.evaluate(() => window.audioCallbacks);
	await page.getByRole('button', {name: 'Resume audio'}).click();
	await expect.poll(() => page.evaluate(() => window.audioCallbacks)).toBeGreaterThan(previous);
};
