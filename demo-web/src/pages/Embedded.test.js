import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

const {
	editor
	, phpExec
	, phpRefresh
	, phpRun
	, PhpWeb
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
		return phpInstance;
	});

	return {
		editor
		, phpExec
		, phpRefresh
		, phpRun
		, PhpWeb
	};
});

vi.mock('php-wasm/PhpWeb', () => ({PhpWeb}));

vi.mock('@electric-sql/pglite', () => ({
	PGlite: class PGliteMock {}
}));

vi.mock('php-wasm-sdl', () => ({
	default: {}
}));

vi.mock('ace-builds/src-noconflict/mode-php', () => ({}));
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
	, buildType: 'static'
	, defaultPhpVersion: '8.4'
}));

import Embedded from './Embedded';

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

		global.fetch = vi.fn(async () => ({
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
			expect(global.fetch).toHaveBeenCalledWith('/php-wasm/scripts/hello-world.php');
		});

		let executedCode;

		await waitFor(() => {
			expect(phpRun).toHaveBeenCalledTimes(1);
			[executedCode] = phpRun.mock.calls[0];
			expect(executedCode).toContain('echo "Hello, World!";');
		});

		expect(executedCode).not.toBe('');
		expect(new URLSearchParams(window.location.search).get('code')).not.toBe('');
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
});
