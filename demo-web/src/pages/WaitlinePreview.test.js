import React from 'react';
import { render, screen } from '@testing-library/react';

const { terminalProps } = vi.hoisted(() => ({terminalProps: vi.fn()}));

vi.mock('../components/Terminal', () => ({
	default: props => {
		terminalProps(props);
		return React.createElement('div', null, 'Terminal');
	}
}));

import WaitlinePreview, { waitlineDemoCode } from './WaitlinePreview';

describe('WaitlinePreview', () => {
	beforeEach(() => terminalProps.mockClear());

	it('runs the guided readline exercise with scripted line input enabled', () => {
		render(<WaitlinePreview />);

		expect(screen.getByRole('heading', {name: 'waitline / readline test'})).toBeInTheDocument();
		expect(screen.getByText('Terminal')).toBeInTheDocument();
		expect(terminalProps).toHaveBeenCalledWith(expect.objectContaining({
			interactive: false
			, lineInput: true
			, inputPrompt: ''
			, code: waitlineDemoCode
		}));
		expect(waitlineDemoCode).toContain("readline('1/3 Unicode input");
		expect(waitlineDemoCode).toContain('readline_callback_read_char()');
		expect(waitlineDemoCode).toContain('readline_write_history');
	});
});
