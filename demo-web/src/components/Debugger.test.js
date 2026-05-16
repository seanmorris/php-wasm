import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { dumpGlobals, PhpDbgWeb } = vi.hoisted(() => {
	const origZval = Symbol('origZval');

	const createGlobalsProxy = () => {
		const globals = {};

		Object.defineProperty(globals, origZval, {
			value: 41810024
		});

		Object.defineProperty(globals, 'foo', {
			enumerable: true
			, value: 'bar'
		});

		Object.defineProperty(globals, 'GLOBALS', {
			enumerable: true
			, get: () => createGlobalsProxy()
		});

		return new Proxy(globals, {});
	};

	const dumpGlobals = vi.fn(async () => {
		return createGlobalsProxy();
	});

	const PhpDbgWeb = vi.fn(function PhpDbgWebMock() {
		this.addEventListener = vi.fn();
		this.removeEventListener = vi.fn();
		this.dumpGlobals = dumpGlobals;
		this.dumpVars = vi.fn(async () => ({}));
		this.dumpConstants = vi.fn(async () => ({}));
		this.dumpFunctions = vi.fn(async () => ({}));
		this.dumpClasses = vi.fn(async () => ({}));
		this.dumpFiles = vi.fn(async () => ([]));
		this.dumpBacktrace = vi.fn(async () => ([]));
		this.switchFrame = vi.fn(async () => 0);
		this.provideInput = vi.fn(async () => undefined);
		this.isExecuting = vi.fn(async () => false);
		this.getPrompt = vi.fn(async () => 'prompt> ');
		this.currentFile = vi.fn(async () => '/persist/test.php');
		this.currentLine = vi.fn(async () => 1);
		this.run = vi.fn();
		this.interactive = true;
	});

	return {dumpGlobals, PhpDbgWeb};
});

vi.mock('../lib/runtimePaths', () => ({
	libType: 'static',
	buildType: 'static'
}));

vi.mock('php-dbg-wasm/PhpDbgWeb', () => ({
	PhpDbgWeb
}));

vi.mock('@electric-sql/pglite', () => ({
	PGlite: function PGliteMock() {}
}));

vi.mock('ansi-to-html', () => ({
	default: class ConvertMock {
		toHtml(text) {
			return text;
		}
	}
}));

import Debugger from './Debugger';

describe('Debugger', () => {
	beforeEach(() => {
		dumpGlobals.mockClear();
		PhpDbgWeb.mockClear();
	});

	it('renders circular globals without recursing forever', async () => {
		render(<Debugger />);

		fireEvent.click(screen.getByRole('button', {name: 'globals'}));

		await waitFor(() => {
			expect(dumpGlobals).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByText('[Circular]')).toBeInTheDocument();
		expect(screen.getByText('foo:')).toBeInTheDocument();
	});
});
