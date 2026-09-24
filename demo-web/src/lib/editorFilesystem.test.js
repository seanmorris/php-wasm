const {bus} = vi.hoisted(() => ({bus: {editorFilesystem: vi.fn()}}));
vi.mock('./phpBus', () => ({getPhpBus: async () => bus}));
import {editorFilesystem} from './editorFilesystem';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	bus.editorFilesystem.mockReset();
});

it('times out read-only operations and releases their message listener', async () => {
	vi.useFakeTimers();
	const pending = new Promise(() => {});
	pending.abort = vi.fn();
	bus.editorFilesystem.mockReturnValue(pending);
	const read = editorFilesystem.read('/persist/a');
	const rejected = expect(read).rejects.toThrow('30 seconds');
	await vi.advanceTimersByTimeAsync(30000);
	await rejected;
	expect(pending.abort).toHaveBeenCalledOnce();
});

it('keeps a slow write alive and preserves its eventual conflict code', async () => {
	vi.useFakeTimers();
	let reject;
	bus.editorFilesystem.mockReturnValue(new Promise((_, fail) => {
		reject = fail;
	}));
	const write = editorFilesystem.write('/persist/a', new Uint8Array(), 'old');
	const failure = expect(write).rejects.toMatchObject({code: 'EDITOR_CONFLICT'});
	await vi.advanceTimersByTimeAsync(60000);
	reject({message: 'changed', code: 'EDITOR_CONFLICT'});
	await failure;
});

it('rejects reads when the controlling worker changes', async () => {
	const serviceWorker = new EventTarget();
	vi.stubGlobal('navigator', {serviceWorker});
	bus.editorFilesystem.mockReturnValue(new Promise(() => {}));
	const read = editorFilesystem.list('/');
	const rejected = expect(read).rejects.toThrow('worker changed');
	await Promise.resolve();
	serviceWorker.dispatchEvent(new Event('controllerchange'));
	await rejected;
});
