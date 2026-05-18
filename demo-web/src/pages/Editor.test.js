import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const {
	createEditSession
	, editor
	, bus
	, getPhpBus
} = vi.hoisted(() => {
	Object.defineProperty(globalThis.navigator, 'serviceWorker', {
		configurable: true
		, value: {controller: {}}
	});

	const bus = {
		readFile: vi.fn(async () => new TextEncoder().encode('<?php echo 123;'))
		, writeFile: vi.fn(async () => undefined)
		, analyzePath: vi.fn(async () => ({exists: true}))
	};

	const getPhpBus = vi.fn(async () => bus);

	const createEditSession = vi.fn((code, mode) => ({
		$modeId: mode
		, addMarker: vi.fn()
		, clearBreakpoint: vi.fn()
		, on: vi.fn()
		, removeMarker: vi.fn()
		, setBreakpoint: vi.fn()
		, value: code
	}));

	const editor = {
		getSession: vi.fn(function() {
			return this.session;
		})
		, getValue: vi.fn(() => '<?php echo 123;')
		, off: vi.fn()
		, on: vi.fn()
		, scrollToLine: vi.fn()
		, setReadOnly: vi.fn()
		, setSession: vi.fn(function(session) {
			this.session = session;
		})
		, session: null
	};

	return {
		createEditSession
		, editor
		, bus
		, getPhpBus
	};
});

vi.mock('../lib/phpBus', () => ({
	getPhpBus
}));

vi.mock('ace-builds', () => ({
	default: {createEditSession}
	, Range: class RangeMock {}
}));

vi.mock('ace-builds/src-noconflict/mode-css', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-html', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-javascript', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-json', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-markdown', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-php', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-text', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-xml', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-yaml', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-monokai', () => ({}));

vi.mock('react-ace', () => ({
	default: React.forwardRef(function AceEditorMock({onLoad}, ref) {
		React.useEffect(() => {
			onLoad?.(editor);
		}, [onLoad]);

		React.useImperativeHandle(ref, () => ({editor}), []);

		return React.createElement('div', {'data-testid': 'ace-editor'});
	})
}));

vi.mock('../components/Debugger', () => ({
	default: React.forwardRef(function DebuggerMock(_, ref) {
		React.useImperativeHandle(ref, () => ({}), []);
		return null;
	})
}));

vi.mock('../components/EditorFolder', () => ({
	default: function EditorFolderMock() {
		return null;
	}
}));

vi.mock('../components/Header', () => ({
	default: function HeaderMock() {
		return React.createElement('div', null, 'Header');
	}
}));

vi.mock('../lib/runtimePaths', () => ({
	basePath: (path = '') => `/php-wasm/${path}`
}));

import Editor from './Editor';

describe('Editor', () => {
	beforeEach(() => {
		bus.readFile.mockClear();
		bus.writeFile.mockClear();
		bus.analyzePath.mockClear();
		getPhpBus.mockClear();
		createEditSession.mockClear();
		editor.getSession.mockClear();
		editor.getValue.mockClear();
		editor.off.mockClear();
		editor.on.mockClear();
		editor.scrollToLine.mockClear();
		editor.setReadOnly.mockClear();
		editor.setSession.mockClear();
		editor.session = null;
		HTMLElement.prototype.scrollTo = vi.fn();

		window.history.pushState({}, '', '/code-editor.html?path=/persist/test-breakpoint.php');
	});

	it('opens the requested query-string path after Ace loads', async () => {
		render(<Editor />);

		await waitFor(() => {
			expect(bus.readFile).toHaveBeenCalledWith('/persist/test-breakpoint.php');
		});

		expect(screen.getByText('test-breakpoint.php')).toBeInTheDocument();
		expect(createEditSession).toHaveBeenCalledWith('<?php echo 123;', 'ace/mode/php');
		expect(editor.setReadOnly).toHaveBeenCalledWith(false);
		expect(screen.getByTestId('ace-editor').closest('.editor')).toHaveAttribute('data-show-left', 'true');
	});
});
