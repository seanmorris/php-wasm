/**
 * Browser entrypoint that registers the CGI worker alongside the app shell.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './styles/Common.css';
import App from './App';
import { ensureServiceWorker } from './lib/serviceWorker';

const params = new URLSearchParams(window.location.search);

if(!params.has('no-service-worker'))
{
	(async () => {
		const serviceWorker = await ensureServiceWorker();

		if(!serviceWorker.controlled)
		{
			console.error('CGI service worker startup failed.', {
				controlSource: serviceWorker.controlSource
				, error: serviceWorker.error
				, diagnostics: serviceWorker.diagnostics
			});
			// Runtime consumers own bounded recovery; a reload would interrupt it.
		}
	})();
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode>
	<App />
</React.StrictMode>
);
