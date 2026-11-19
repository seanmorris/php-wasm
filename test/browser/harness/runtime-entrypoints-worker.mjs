import {runEntrypoint} from './runtime-entrypoints.mjs';

self.addEventListener('message', async event => {
	try
	{
		self.postMessage({result: await runEntrypoint(event.data)});
	}
	catch(error)
	{
		self.postMessage({error: String(error.stack ?? error)});
	}
});
