import {getPhpBus} from './phpBus';

/** Bound read-only waits; mutations keep their original reply so late commits are observed. */
const requestFilesystem = async request => {
	const bus = await getPhpBus();
	const pending = bus.editorFilesystem(request);
	if(!['read', 'stat', 'inspect', 'list'].includes(request.op)) return pending;
	let timer;
	let changed;
	try
	{
		return await Promise.race([
			pending
			, new Promise((_, reject) => {
				changed = () => reject(new Error('The filesystem worker changed. Refresh and try reading again.'));
				navigator.serviceWorker?.addEventListener('controllerchange', changed);
				timer = setTimeout(() => reject(new Error('No filesystem reply after 30 seconds. Refresh to retry this read.')), 30000);
			})
		]);
	}
	finally
	{
		clearTimeout(timer);
		navigator.serviceWorker?.removeEventListener('controllerchange', changed);
		pending.abort?.();
	}
};

/** Small UI adapter for checked, demo-local filesystem requests. */
export const editorFilesystem = {
	request: requestFilesystem
	, read: path => editorFilesystem.request({op: 'read', path})
	, stat: path => editorFilesystem.request({op: 'stat', path})
	, inspect: path => editorFilesystem.request({op: 'inspect', path})
	, list: path => editorFilesystem.request({op: 'list', path})
	, write: (path, bytes, expectedRevision) => editorFilesystem.request({op: 'write', path, bytes, expectedRevision})
	, mutate: request => editorFilesystem.request(request)
};
