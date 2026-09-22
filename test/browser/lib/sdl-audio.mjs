import {expect} from '@playwright/test';
import {start} from './sdl-bindings.mjs';

/**
 * Observe real Web Audio output without replacing SDL's native mixer callback.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<void>} Resolves after the isolated PHP runtime starts.
 */
export const startAudio = async page => {
	await page.addInitScript(() => {
		window.audioContexts = [];
		window.audioProcessors = [];
		window.audioSamples = 0;
		window.audioCallbacks = 0;
		const NativeAudioContext = window.AudioContext;
		window.AudioContext = class extends NativeAudioContext {
			constructor(...args)
			{
				super(...args);
				window.audioContexts.push(this);
			}

			createScriptProcessor(...args)
			{
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
					set(callback)
					{
						descriptor.set.call(node, event => {
							callback(event);
							window.audioCallbacks++;
							if(event.outputBuffer.getChannelData(0).some(sample => Math.abs(sample) > .001))
							{
								window.audioSamples++;
							}
						});
					}
				});
				return node;
			}
		};
	});
	await start(page);
	await page.evaluate(() => {
		const button = document.createElement('button');
		button.textContent = 'Resume audio';
		button.onclick = () => window.audioContexts.forEach(context => {
			if(context.state !== 'closed') { context.resume(); }
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
