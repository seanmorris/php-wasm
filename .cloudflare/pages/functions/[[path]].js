// Release staging uses advanced mode. Keep legacy Functions routing on the same
// asset implementation so compression handling cannot diverge.
import { serveNightlyAsset } from '../r2.mjs';

export const onRequest = context => serveNightlyAsset(context.request, context.env);
