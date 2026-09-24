import {editorTransferLimits, validateTransfer} from './editorTransfers';

/** Run one isolated archive worker and release its Wasm memory on every outcome. */
export const editorArchive = async (mode, input) => {
	if(mode === 'unpack' && input.byteLength > editorTransferLimits.compressed) throw new Error('ZIP input exceeds 64 MiB.');
	if(mode === 'pack') validateTransfer(input);
	const worker = new Worker(new URL('./editorArchive.worker.js', import.meta.url), {type: 'module'});
	let timeout;
	try
	{
		const result = await new Promise((resolve, reject) => {
			worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
			worker.onerror = event => reject(new Error(event.message || 'Archive worker failed.'));
			timeout = setTimeout(() => reject(new Error('Archive processing exceeded three minutes. No destination files were changed.')), 180000);
			worker.postMessage({mode, input});
		});
		return mode === 'unpack' ? validateTransfer(result) : result;
	}
	finally
	{
		clearTimeout(timeout);
		worker.terminate();
	}
};
