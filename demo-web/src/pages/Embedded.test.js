import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

const {
	editor
	, phpExec
	, phpRefresh
	, phpRun
	, PhpWeb
	, prepareSdlAssets
} = vi.hoisted(() => {
	const editor = {
		getValue: vi.fn(() => '')
	};

	const phpRun = vi.fn(async () => 0);
	const phpExec = vi.fn(async () => '');
	const phpRefresh = vi.fn(async () => undefined);

	const phpInstance = {
		addEventListener: vi.fn()
		, removeEventListener: vi.fn()
		, exec: phpExec
		, refresh: phpRefresh
		, run: phpRun
	};

	const PhpWeb = vi.fn(function PhpWebMock() {
		return {...phpInstance};
	});
	const prepareSdlAssets = vi.fn(async () => undefined);

	return {
		editor
		, phpExec
		, phpRefresh
		, phpRun
		, PhpWeb
		, prepareSdlAssets
	};
});

vi.mock('php-wasm/PhpWeb', () => ({PhpWeb}));
vi.mock('../lib/sdlAssets', () => ({prepareSdlAssets}));

vi.mock('@electric-sql/pglite', () => ({
	PGlite: class PGliteMock {}
}));

vi.mock('../lib/phpEditorMode', () => ({createPhpEditorMode: () => ({})}));
vi.mock('ace-builds/src-noconflict/theme-monokai', () => ({}));

vi.mock('react-ace', () => ({
	default: React.forwardRef(function AceEditorMock({value}, ref) {
		React.useImperativeHandle(ref, () => ({editor}), []);

		return React.createElement('div', {'data-testid': 'ace-editor'}, value);
	})
}));

vi.mock('../components/Confirm', () => ({
	default: function ConfirmMock() {
		return null;
	}
}));

vi.mock('../lib/runtimePaths', () => ({
	basePath: (path = '') => `/php-wasm/${path}`
	, libType: 'dynamic'
	, buildType: 'dynamic'
	, defaultPhpVersion: '8.4'
}));

import Embedded, {resolveDynamicExtensionModules} from './Embedded';

describe('Embedded', () => {
	const phpCode = `<?php //{"autorun":true,"persist":false,"single-expression":false,"render-as":"text"}

echo "Hello, World!";
`;

	beforeEach(() => {
		PhpWeb.mockClear();
		editor.getValue.mockClear();
		phpExec.mockClear();
		phpRefresh.mockClear();
		phpRun.mockClear();
		prepareSdlAssets.mockReset().mockResolvedValue(undefined);

		globalThis.fetch = vi.fn(async () => ({
			ok: true
			, text: async () => phpCode
		}));

		window.history.pushState(
			{}
			, ''
			, '/embedded-php.html?demo=hello-world.php&version=8.0&extensionFlags=0'
		);
	});

	it('autoruns the fetched demo code even if Ace is still empty', async () => {
		render(<Embedded />);

		await waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledWith('/php-wasm/scripts/hello-world.php');
		});

		let executedCode;

		await waitFor(() => {
			expect(phpRun).toHaveBeenCalledTimes(1);
			[executedCode] = phpRun.mock.calls[0];
			expect(executedCode).toContain('echo "Hello, World!";');
		});

		expect(executedCode).not.toBe('');
		expect(new URLSearchParams(window.location.search).has('code')).toBe(false);
		expect(new URLSearchParams(window.location.hash.slice(1)).get('code')).toBe(executedCode);
	});

	it.each(['fragment', 'legacy query'])('restores and autoruns shared code from a %s link while Ace is empty', async kind => {
		const code = phpCode + '// Unicode: 🧊 café; literals: 100% %20 + # &\n';
		const source = kind === 'fragment'
			? `#${new URLSearchParams({code})}`
			: `&${new URLSearchParams({code: encodeURIComponent(code)})}`;
		window.history.replaceState({}, '', `/embedded-php.html?version=8.4&extensionFlags=0${source}`);
		render(<Embedded />);
		await waitFor(() => expect(phpRun).toHaveBeenCalledTimes(1));
		expect(phpRun.mock.calls[0][0]).toContain('// Unicode: 🧊 café; literals: 100% %20 + # &');
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(new URLSearchParams(window.location.search).has('code')).toBe(false);
		expect(new URLSearchParams(window.location.hash.slice(1)).get('code')).toBe(phpRun.mock.calls[0][0]);
	});

	it('boots the embedded demo only once under StrictMode', async () => {
		render(
			<React.StrictMode>
				<Embedded />
			</React.StrictMode>
		);

		await waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
			expect(PhpWeb).toHaveBeenCalledTimes(1);
			expect(phpRun).toHaveBeenCalledTimes(1);
		});
	});

	it('uses Ace content for a manual run after the demo loads', async () => {
		const {container} = render(<Embedded />);

		await waitFor(() => {
			expect(phpRun).toHaveBeenCalledTimes(1);
		});

		phpRun.mockClear();
		editor.getValue.mockReturnValue('<?php echo "Edited in Ace";');

		fireEvent.click(container.querySelector('[data-run="true"]'));

		await waitFor(() => {
			expect(phpRun).toHaveBeenCalledWith('<?php echo "Edited in Ace";');
		});

		expect(editor.getValue).toHaveBeenCalled();
	});

	it('loads zlib whenever the GD extension is selected', async () => {
		const gd = {default: 'gd'};
		const zlib = {default: 'zlib'};
		const modules = await resolveDynamicExtensionModules({
			gd: {active: true, module: Promise.resolve(gd)}
			, zlib: {active: false, module: Promise.resolve(zlib)}
		});

		expect(modules).toEqual(['gd', 'zlib']);
	});

	it('discards a pending SDL run when switching demos and replaces its canvas', async () => {
		const cubeCode = '<?php //{"autorun":true,"persist":true,"canvas":true,"variant":"_sdl","assets":"sdl","extensionFlags":0}\n echo "cube";';
		globalThis.fetch.mockImplementation(async url => ({
			ok: true
			, text: async () => url.endsWith('sdl-cube.php') ? cubeCode : phpCode
		}));
		let releaseAssets;
		prepareSdlAssets.mockImplementationOnce(() => new Promise(resolve => releaseAssets = resolve));
		const {container} = render(<Embedded />);
		await waitFor(() => expect(phpRun).toHaveBeenCalledTimes(1));
		const originalCanvas = container.querySelector('canvas');
		const demos = container.querySelector('select option[value="sdl-cube.php"]').parentElement;
		fireEvent.change(demos, {target: {value: 'sdl-cube.php'}});
		fireEvent.click(container.querySelector('[data-load-demo]'));
		await waitFor(() => expect(prepareSdlAssets).toHaveBeenCalledTimes(1));
		expect(container.querySelector('canvas')).not.toBe(originalCanvas);
		const [{sharedLibs}] = PhpWeb.mock.calls[1];
		expect(sharedLibs.map(library => library.name).sort()).toEqual(['libfreetype.so', 'libjpeg.so', 'libpng.so', 'libz.so']);
		fireEvent.change(demos, {target: {value: 'hello-world.php'}});
		fireEvent.click(container.querySelector('[data-load-demo]'));
		await waitFor(() => expect(phpRun).toHaveBeenCalledTimes(2));
		await act(async () => releaseAssets());
		expect(phpRun).toHaveBeenCalledTimes(2);
		expect(phpRun.mock.calls.every(([code]) => !code.includes('echo "cube"'))).toBe(true);
	});

	it('shows asset errors without starting PHP code', async () => {
		prepareSdlAssets.mockRejectedValueOnce(new Error('SDL asset WOJTEK3.mp3: HTTP 404'));
		globalThis.fetch.mockResolvedValue({
			ok: true
			, text: async () => '<?php //{"autorun":true,"persist":true,"canvas":true,"variant":"_sdl","assets":"sdl","extensionFlags":0}\n echo "cube";'
		});
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const {container} = render(<Embedded />);
		await waitFor(() => expect(container.querySelector('.stderr')).toHaveTextContent('SDL asset WOJTEK3.mp3: HTTP 404'));
		expect(phpRun).not.toHaveBeenCalled();
		errorLog.mockRestore();
	});

	it.each([
		['phar', 32768, ['php8.0-phar.so']]
		, ['zlib', 16384, ['php8.0-zlib.so', 'libz.so']]
	])('loads %s with its own extension flag', async (name, flag, libraries) => {
		window.history.replaceState({}, '', `?demo=hello-world.php&version=8.0&extensionFlags=${flag}`);
		render(<Embedded />);

		await waitFor(() => expect(phpRun).toHaveBeenCalledTimes(1));

		const [{sharedLibs}] = PhpWeb.mock.calls[0];
		expect(sharedLibs.flatMap(module => module.getLibs({phpVersion: '8.0'}).map(lib => lib.name))).toEqual(libraries);
	});
});
