import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../components/Header', () => ({
	default: function HeaderMock() {
		return React.createElement('div', null, 'Header');
	}
}));

import Home from './Home';

describe('Home', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		window.history.pushState({}, '', '/home.html?no-service-worker');
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('includes WordPress in the CGI framework carousel', () => {
		render(<Home />);

		const frameworkLink = screen.getByRole('link', {name: /PHP CGI Demo/});

		expect(within(frameworkLink).getByRole('img', {name: 'WordPress logo'})).toBeInTheDocument();
		expect(frameworkLink).toHaveAttribute('href', '/select-framework.html');
	});

	it('puts one Query Workbench link in Extras, not the main demo buttons', () => {
		render(<Home />);
		expect(screen.queryByRole('link', {name: 'Query Workbench'})).not.toBeInTheDocument();
		fireEvent.click(screen.getByText('More...'));
		const link = screen.getByRole('link', {name: 'Query Workbench'});
		expect(link).toHaveAttribute('href', '/query-workbench.html');
		expect(link.closest('.extra-demos')).not.toBeNull();
		expect(screen.queryByRole('button', {name: 'Query Workbench'})).not.toBeInTheDocument();
	});
});
