import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

const { run, addEventListener, removeEventListener, getLastInstance, PhpCliWeb } = vi.hoisted(() => {
	const run = vi.fn().mockResolvedValue(0);
	const addEventListener = vi.fn();
	const removeEventListener = vi.fn();
	const instances = [];
	const PhpCliWeb = vi.fn(function PhpCliWebMock() {
		this.listeners = new Map();
		this.binary = Promise.resolve({});
		this.run = run;
		this.addEventListener = (type, handler) => {
			addEventListener(type, handler);
			const handlers = this.listeners.get(type) || [];
			handlers.push(handler);
			this.listeners.set(type, handlers);
		};
		this.removeEventListener = (type, handler) => {
			removeEventListener(type, handler);
			const handlers = this.listeners.get(type) || [];
			this.listeners.set(type, handlers.filter(existing => existing !== handler));
		};
		instances.push(this);
	});

	return {
		run
		, addEventListener
		, removeEventListener
		, getLastInstance: () => instances.at(-1)
		, PhpCliWeb
	};
});

vi.mock('../lib/runtimePaths', () => ({
	libType: 'static',
	buildType: 'static'
}));

vi.mock('php-cli-wasm/PhpCliWeb', () => ({
	PhpCliWeb
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

import Terminal from './Terminal';

describe('Terminal', () => {
	beforeEach(() => {
		run.mockClear();
		addEventListener.mockClear();
		removeEventListener.mockClear();
		PhpCliWeb.mockClear();
	});

	it('runs non-interactive CLI code once under StrictMode', async () => {
		render(
			<React.StrictMode>
				<Terminal interactive = {false} code = {'echo "ok";'} />
			</React.StrictMode>
		);

		await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
		expect(run).toHaveBeenCalledWith(['-c', '/php.ini']);
	});

	it('does not restart the CLI when streamed output rerenders the terminal', async () => {
		render(<Terminal interactive = {false} code = {'echo "ok";'} />);

		await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

		const terminal = getLastInstance();
		const [onOutput] = terminal.listeners.get('output');

		await act(async () => {
			onOutput({detail: ['[ 1.00 ] file.txt\n']});
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		expect(run).toHaveBeenCalledTimes(1);
	});
});
