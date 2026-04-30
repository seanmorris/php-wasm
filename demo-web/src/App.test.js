import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./CliPreview', () => ({
	default: () => React.createElement('div', null, 'CLI Preview')
}));

vi.mock('./DbgPreview', () => ({
	default: () => React.createElement('div', null, 'Debug Preview')
}));

vi.mock('./Editor', () => ({
	default: () => React.createElement('div', null, 'Code Editor')
}));

vi.mock('./Embedded', () => ({
	default: () => React.createElement('div', null, 'Embedded Demo')
}));

vi.mock('./Home', () => ({
	default: () => React.createElement('div', null, 'Home Page')
}));

vi.mock('./InstallDemo', () => ({
	default: () => React.createElement('div', null, 'Install Demo')
}));

vi.mock('./MultiIframeTest', () => ({
	default: () => React.createElement('div', null, 'Iframe Test')
}));

vi.mock('./SelectFramework', () => ({
	default: () => React.createElement('div', null, 'Select Framework')
}));

vi.mock('./VSCodeEditor', () => ({
	default: () => React.createElement('div', null, 'VSCode Editor')
}));

import { AppRoutes } from './App';

describe('AppRoutes', () => {
	it('renders the home page direct entry', () => {
		render(
			React.createElement(
				MemoryRouter,
				{ initialEntries: ['/home.html'] },
				React.createElement(AppRoutes)
			)
		);

		expect(screen.getByText('Home Page')).toBeInTheDocument();
	});

	it('redirects legacy CGI routes to the install flow', () => {
		render(
			React.createElement(
				MemoryRouter,
				{ initialEntries: ['/cgi-bin/drupal'] },
				React.createElement(AppRoutes)
			)
		);

		expect(screen.getByText('Install Demo')).toBeInTheDocument();
	});
});
